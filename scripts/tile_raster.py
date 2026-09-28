#!/usr/bin/env python3

"""
此脚本用于将影像栅格切成 Web 瓦片，切片能力全部通过系统 GDAL 命令行完成

依赖：
    系统需安装 GDAL 3.0+（其中 `gdal raster tile` 子命令要求 GDAL 3.11+），
    且 `gdalinfo` 与 `gdal` 可执行文件位于 PATH 中；脚本自身只使用 Python 标准库。

用法：
    python scripts/tile_raster.py <输入影像> -o <输出目录> [--min-zoom 6] [--max-zoom 18]

输出目录结构：
    <输出目录>/tiles/{z}/{x}/{y}.png   切片数据
    <输出目录>/gdalinfo.json           gdalinfo -json 的原始输出
    <输出目录>/metadata.json           解析后的精简摘要 + 本次切片参数

2026年9月10日 - 初始化影像切片脚本
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any

# ===== 配置区域（按需修改） =====
# 本脚本要求的最低 GDAL 版本
REQUIRED_GDAL_VERSION = (3, 0)
# `gdal raster tile` 子命令引入的 GDAL 版本
TILE_COMMAND_GDAL_VERSION = (3, 11)

# 输出目录内的固定结构
TILES_DIR_NAME = "tiles"
GDALINFO_FILE_NAME = "gdalinfo.json"
METADATA_FILE_NAME = "metadata.json"

# WebMercator 单侧范围（米）与地理坐标每度对应的赤道弧长（米），用于推算 zoom 层级
WEB_MERCATOR_EXTENT = 20037508.342789244
METERS_PER_DEGREE = 111319.49079327358
DEFAULT_TILE_SIZE = 256
# zoom 推算结果的钳制范围
MIN_SUPPORTED_ZOOM = 0
MAX_SUPPORTED_ZOOM = 24

# 输出格式与瓦片扩展名的映射，用于拼接瓦片 URL 模板
FORMAT_EXTENSIONS = {
    "PNG": "png",
    "JPEG": "jpg",
    "WEBP": "webp",
    "GTIFF": "tif",
}


def relax_console_encoding() -> None:
    """放宽标准输出的编码错误处理，避免 Windows GBK 控制台因 emoji 直接抛错"""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(errors="replace")


def parse_arguments() -> argparse.Namespace:
    """解析命令行参数"""
    parser = argparse.ArgumentParser(
        description="调用系统 GDAL 命令将影像切成 Web 瓦片，并输出解析后的影像信息 JSON",
        formatter_class=argparse.RawTextHelpFormatter,
        epilog=(
            "示例：\n"
            "  python scripts/tile_raster.py D:/data/image.tif -o D:/output/image_tiles\n"
            "  python scripts/tile_raster.py D:/data/image.tif -o D:/output/image_tiles "
            "--min-zoom 6 --max-zoom 18 --format JPEG --skip-blank"
        ),
    )
    parser.add_argument("input", help="输入影像路径（GDAL 支持的任意栅格格式）")
    parser.add_argument("-o", "--output", required=True, help="输出目录（不存在时自动创建）")
    parser.add_argument(
        "--min-zoom",
        type=int,
        default=None,
        help="最小 zoom 层级；缺省时按影像范围自动推算（GDAL 默认只切最大层级）",
    )
    parser.add_argument(
        "--max-zoom",
        type=int,
        default=None,
        help="最大 zoom 层级；缺省时由 GDAL 按影像分辨率自动决定",
    )
    parser.add_argument(
        "--tiling-scheme",
        default="WebMercatorQuad",
        choices=[
            "raster",
            "WebMercatorQuad",
            "WorldCRS84Quad",
            "WorldMercatorWGS84Quad",
            "GoogleCRS84Quad",
            "PseudoTMS_GlobalMercator",
            "GlobalGeodeticOriginLat270",
        ],
        help="切片方案（默认 WebMercatorQuad，即常见的 XYZ 底图方案）",
    )
    parser.add_argument(
        "-f",
        "--format",
        default="PNG",
        help="瓦片输出格式，如 PNG / JPEG / WEBP（默认 PNG）",
    )
    parser.add_argument(
        "-r",
        "--resampling",
        default="cubic",
        choices=[
            "nearest",
            "bilinear",
            "cubic",
            "cubicspline",
            "lanczos",
            "average",
            "rms",
            "mode",
            "min",
            "max",
            "med",
            "q1",
            "q3",
            "sum",
        ],
        help="最大层级的重采样方法（默认 cubic）",
    )
    parser.add_argument(
        "--overview-resampling",
        default=None,
        help="金字塔层级的重采样方法；缺省时跟随 --resampling",
    )
    parser.add_argument("--tile-size", type=int, default=None, help="瓦片边长像素（默认 256）")
    parser.add_argument(
        "--convention",
        default="xyz",
        choices=["xyz", "tms"],
        help="瓦片行号约定：xyz 自上而下，tms 自下而上（默认 xyz）",
    )
    parser.add_argument(
        "--num-threads",
        default="ALL_CPUS",
        help="切片并发数，可填数字或 ALL_CPUS（默认 ALL_CPUS）",
    )
    parser.add_argument(
        "--webviewer",
        default="none",
        choices=["none", "all", "leaflet", "openlayers", "mapml", "stac"],
        help="附带生成的预览页类型（默认 none，只产出瓦片）",
    )
    parser.add_argument(
        "--co",
        "--creation-option",
        dest="creation_options",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="传给 GDAL 的创建选项，可重复，如 --co QUALITY=85",
    )
    parser.add_argument("--skip-blank", action="store_true", help="跳过全空瓦片，减少产物体积")
    parser.add_argument("--resume", action="store_true", help="断点续切，只生成缺失的瓦片")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="切片前清空已存在的 tiles 目录（与 --resume 互斥）",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="gdalinfo 额外统计各波段的最值与均值（大影像会明显变慢）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只解析影像信息并打印切片命令，不真正执行切片",
    )
    return parser.parse_args()


def resolve_executable(name: str) -> str:
    """在 PATH 中定位 GDAL 可执行文件，缺失时终止脚本"""
    executable = shutil.which(name)
    if not executable:
        raise SystemExit(f"❌ 未找到 {name} 命令，请先安装 GDAL 3.0+ 并将其加入 PATH")
    return executable


def run_command(command: list[str], *, capture_output: bool = False) -> subprocess.CompletedProcess:
    """执行系统命令；capture_output 为真时捕获输出，否则直接透传到当前终端"""
    try:
        # 统一按 UTF-8 解码，避免 Windows 默认 GBK 破坏 gdalinfo 的 JSON 输出
        result = subprocess.run(
            command,
            capture_output=capture_output,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except OSError as error:
        raise SystemExit(f"❌ 命令执行失败：{' '.join(command)} -> {error}") from error
    if result.returncode != 0:
        message = (result.stderr or "").strip() if capture_output else ""
        detail = f"\n{message}" if message else ""
        raise SystemExit(f"❌ 命令返回非零退出码（{result.returncode}）：{' '.join(command)}{detail}")
    return result


def read_gdal_version(gdalinfo_executable: str) -> tuple[str, tuple[int, int, int]]:
    """读取 GDAL 版本，返回（原始版本文本, 版本号三元组）"""
    result = run_command([gdalinfo_executable, "--version"], capture_output=True)
    raw_version = result.stdout.strip()
    matched = re.search(r"GDAL\s+(\d+)\.(\d+)\.(\d+)", raw_version)
    if not matched:
        raise SystemExit(f"❌ 无法解析 GDAL 版本号：{raw_version}")
    version = (int(matched.group(1)), int(matched.group(2)), int(matched.group(3)))
    return raw_version, version


def format_version(version: tuple[int, ...]) -> str:
    """把版本号元组格式化为点分字符串"""
    return ".".join(str(part) for part in version)


def ensure_gdal_ready(gdalinfo_executable: str, gdal_executable: str) -> dict[str, Any]:
    """校验 GDAL 版本与 `gdal raster tile` 子命令可用性，返回版本信息"""
    raw_version, version = read_gdal_version(gdalinfo_executable)
    if version < REQUIRED_GDAL_VERSION:
        raise SystemExit(
            f"❌ 需要 GDAL {format_version(REQUIRED_GDAL_VERSION)}+，当前版本为 {format_version(version)}"
        )
    if version < TILE_COMMAND_GDAL_VERSION:
        raise SystemExit(
            f"❌ `gdal raster tile` 子命令需要 GDAL {format_version(TILE_COMMAND_GDAL_VERSION)}+，"
            f"当前版本为 {format_version(version)}，请升级 GDAL 后重试"
        )
    # 部分发行版可能未编译新版 gdal CLI，这里再探测一次子命令是否真实可用
    probe = subprocess.run(
        [gdal_executable, "raster", "tile", "--help"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if probe.returncode != 0:
        raise SystemExit("❌ 当前 GDAL 未提供 `gdal raster tile` 子命令，请改用官方 GDAL 3.11+ 发行版")
    print(f"ℹ️ 使用 {raw_version}")
    return {"version": format_version(version), "raw": raw_version}


def read_raster_info(gdalinfo_executable: str, input_path: Path, with_stats: bool) -> dict[str, Any]:
    """调用 `gdalinfo -json` 获取影像信息并解析为 dict"""
    command = [gdalinfo_executable, "-json"]
    if with_stats:
        command.append("-stats")
    command.append(str(input_path))
    result = run_command(command, capture_output=True)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise SystemExit(f"❌ gdalinfo 输出无法解析为 JSON：{error}") from error


def is_geographic_crs(info: dict[str, Any]) -> bool:
    """判断影像坐标系是否为地理坐标系（单位为度）"""
    wkt = str(info.get("coordinateSystem", {}).get("wkt", "")).lstrip().upper()
    return wkt.startswith("GEOGCRS") or wkt.startswith("GEOGCS")


def extract_bounding_box(info: dict[str, Any]) -> dict[str, float] | None:
    """从 wgs84Extent 中提取经纬度包围盒"""
    extent = info.get("wgs84Extent")
    if not isinstance(extent, dict):
        return None
    longitudes: list[float] = []
    latitudes: list[float] = []

    def collect(node: Any) -> None:
        """递归收集 GeoJSON 坐标数组中的经纬度点"""
        if (
            isinstance(node, list)
            and len(node) >= 2
            and all(isinstance(value, (int, float)) for value in node[:2])
        ):
            longitudes.append(float(node[0]))
            latitudes.append(float(node[1]))
            return
        if isinstance(node, list):
            for child in node:
                collect(child)

    collect(extent.get("coordinates"))
    if not longitudes or not latitudes:
        return None
    return {
        "west": min(longitudes),
        "south": min(latitudes),
        "east": max(longitudes),
        "north": max(latitudes),
    }


def lonlat_to_web_mercator(longitude: float, latitude: float) -> tuple[float, float]:
    """经纬度转 WebMercator 平面坐标（米）"""
    clamped_latitude = max(min(latitude, 85.051129), -85.051129)
    x = longitude * WEB_MERCATOR_EXTENT / 180.0
    y = (
        math.log(math.tan((90.0 + clamped_latitude) * math.pi / 360.0))
        / (math.pi / 180.0)
        * WEB_MERCATOR_EXTENT
        / 180.0
    )
    return x, y


def estimate_zoom_range(
    info: dict[str, Any], bounding_box: dict[str, float] | None, tile_size: int
) -> dict[str, int] | None:
    """按影像分辨率与范围推算适合的 zoom 层级区间（仅对 WebMercator 方案有参考意义）"""
    geo_transform = info.get("geoTransform")
    if not bounding_box or not isinstance(geo_transform, list) or len(geo_transform) < 6:
        return None
    pixel_size = min(abs(float(geo_transform[1])), abs(float(geo_transform[5])))
    if pixel_size <= 0:
        return None

    center_latitude = (bounding_box["south"] + bounding_box["north"]) / 2.0
    if is_geographic_crs(info):
        # 度 → WebMercator 米：纬度方向的 cos 缩放在墨卡托投影中恰好抵消
        mercator_resolution = pixel_size * METERS_PER_DEGREE
    else:
        cosine = math.cos(math.radians(center_latitude))
        if cosine <= 0:
            return None
        mercator_resolution = pixel_size / cosine
    if mercator_resolution <= 0:
        return None

    full_extent = WEB_MERCATOR_EXTENT * 2
    # 最大层级：瓦片分辨率与影像原始分辨率最接近的层级
    max_zoom = round(math.log2(full_extent / (tile_size * mercator_resolution)))

    min_x, min_y = lonlat_to_web_mercator(bounding_box["west"], bounding_box["south"])
    max_x, max_y = lonlat_to_web_mercator(bounding_box["east"], bounding_box["north"])
    span = max(abs(max_x - min_x), abs(max_y - min_y))
    # 最小层级：整幅影像大致收敛到一张瓦片的层级
    min_zoom = math.floor(math.log2(full_extent / span)) if span > 0 else MIN_SUPPORTED_ZOOM

    max_zoom = max(MIN_SUPPORTED_ZOOM, min(MAX_SUPPORTED_ZOOM, int(max_zoom)))
    min_zoom = max(MIN_SUPPORTED_ZOOM, min(MAX_SUPPORTED_ZOOM, int(min_zoom)))
    return {"min": min(min_zoom, max_zoom), "max": max_zoom}


def summarize_raster_info(info: dict[str, Any], bounding_box: dict[str, float] | None) -> dict[str, Any]:
    """把 gdalinfo 的完整输出提炼为前端与后续脚本可直接消费的摘要"""
    size = info.get("size") or [None, None]
    geo_transform = info.get("geoTransform")
    coordinate_system = info.get("coordinateSystem", {})
    bands = []
    for band in info.get("bands", []):
        summary = {
            "band": band.get("band"),
            "type": band.get("type"),
            "colorInterpretation": band.get("colorInterp"),
            "noDataValue": band.get("noDataValue"),
            "block": band.get("block"),
        }
        # 仅在使用 --stats 时才会有统计字段
        for key in ("minimum", "maximum", "mean", "stdDev"):
            if key in band:
                summary[key] = band[key]
        bands.append(summary)

    pixel_size = None
    if isinstance(geo_transform, list) and len(geo_transform) >= 6:
        pixel_size = {"x": abs(float(geo_transform[1])), "y": abs(float(geo_transform[5]))}

    return {
        "path": info.get("description"),
        "driver": {"short": info.get("driverShortName"), "long": info.get("driverLongName")},
        "size": {"width": size[0], "height": size[1]},
        "pixelSize": pixel_size,
        "geoTransform": geo_transform,
        "coordinateSystem": {
            "isGeographic": is_geographic_crs(info),
            "wkt": coordinate_system.get("wkt"),
            "dataAxisToSRSAxisMapping": coordinate_system.get("dataAxisToSRSAxisMapping"),
        },
        "cornerCoordinates": info.get("cornerCoordinates"),
        "boundingBox": bounding_box,
        "center": (
            {
                "longitude": (bounding_box["west"] + bounding_box["east"]) / 2.0,
                "latitude": (bounding_box["south"] + bounding_box["north"]) / 2.0,
            }
            if bounding_box
            else None
        ),
        "bandCount": len(bands),
        "bands": bands,
    }


def build_tile_command(
    gdal_executable: str,
    arguments: argparse.Namespace,
    input_path: Path,
    tiles_dir: Path,
    min_zoom: int | None,
    max_zoom: int | None,
) -> list[str]:
    """拼装 `gdal raster tile` 命令行"""
    command = [
        gdal_executable,
        "raster",
        "tile",
        "--tiling-scheme",
        arguments.tiling_scheme,
        "--output-format",
        arguments.format,
        "--resampling",
        arguments.resampling,
        "--convention",
        arguments.convention,
        "--num-threads",
        str(arguments.num_threads),
        "--webviewer",
        arguments.webviewer,
    ]
    if arguments.overview_resampling:
        command += ["--overview-resampling", arguments.overview_resampling]
    if min_zoom is not None:
        command += ["--min-zoom", str(min_zoom)]
    if max_zoom is not None:
        command += ["--max-zoom", str(max_zoom)]
    if arguments.tile_size:
        command += ["--tile-size", str(arguments.tile_size)]
    for option in arguments.creation_options:
        command += ["--creation-option", option]
    if arguments.skip_blank:
        command.append("--skip-blank")
    if arguments.resume:
        command.append("--resume")
    command += ["--input", str(input_path), "--output", str(tiles_dir)]
    return command


def build_metadata(
    arguments: argparse.Namespace,
    gdal_version: dict[str, Any],
    summary: dict[str, Any],
    recommended_zoom: dict[str, int] | None,
    min_zoom: int | None,
    max_zoom: int | None,
) -> dict[str, Any]:
    """组装写入 metadata.json 的精简摘要与本次切片参数"""
    extension = FORMAT_EXTENSIONS.get(arguments.format.upper(), arguments.format.lower())
    tile_size = arguments.tile_size or DEFAULT_TILE_SIZE
    return {
        "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "gdal": gdal_version,
        "source": summary,
        "recommendedZoom": recommended_zoom,
        "tiling": {
            "scheme": arguments.tiling_scheme,
            "format": arguments.format,
            "resampling": arguments.resampling,
            "overviewResampling": arguments.overview_resampling or arguments.resampling,
            "convention": arguments.convention,
            "tileSize": tile_size,
            "minZoom": min_zoom,
            "maxZoom": max_zoom,
            "skipBlank": arguments.skip_blank,
            "creationOptions": arguments.creation_options,
            "directory": TILES_DIR_NAME,
            "urlTemplate": f"{TILES_DIR_NAME}/{{z}}/{{x}}/{{y}}.{extension}",
        },
    }


def write_json(path: Path, data: dict[str, Any]) -> None:
    """以 UTF-8 缩进格式写出 JSON 文件"""
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def count_tiles(tiles_dir: Path, extension: str) -> tuple[int, list[str]]:
    """统计切片产物数量与实际生成的 zoom 层级"""
    if not tiles_dir.is_dir():
        return 0, []
    total = sum(1 for _ in tiles_dir.rglob(f"*.{extension}"))
    zooms = sorted(
        (entry.name for entry in tiles_dir.iterdir() if entry.is_dir() and entry.name.isdigit()),
        key=int,
    )
    return total, zooms


def main() -> None:
    """脚本入口：校验环境 → 解析影像信息 → 执行切片 → 写出 JSON"""
    relax_console_encoding()
    arguments = parse_arguments()

    if arguments.resume and arguments.overwrite:
        raise SystemExit("❌ --resume 与 --overwrite 不能同时使用")

    input_path = Path(arguments.input).expanduser().resolve()
    if not input_path.is_file():
        raise SystemExit(f"❌ 输入影像不存在：{input_path}")

    gdalinfo_executable = resolve_executable("gdalinfo")
    gdal_executable = resolve_executable("gdal")
    gdal_version = ensure_gdal_ready(gdalinfo_executable, gdal_executable)

    output_dir = Path(arguments.output).expanduser().resolve()
    tiles_dir = output_dir / TILES_DIR_NAME
    if arguments.overwrite and tiles_dir.exists():
        print(f"🧹 清空已存在的切片目录：{tiles_dir}")
        shutil.rmtree(tiles_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ===== 第一步：读取并解析影像信息 =====
    print(f"🔍 解析影像信息：{input_path}")
    raster_info = read_raster_info(gdalinfo_executable, input_path, arguments.stats)
    bounding_box = extract_bounding_box(raster_info)
    summary = summarize_raster_info(raster_info, bounding_box)
    tile_size = arguments.tile_size or DEFAULT_TILE_SIZE
    recommended_zoom = estimate_zoom_range(raster_info, bounding_box, tile_size)

    width, height = summary["size"]["width"], summary["size"]["height"]
    print(f"   尺寸 {width} x {height}，波段 {summary['bandCount']}，驱动 {summary['driver']['short']}")
    if bounding_box:
        print(
            "   经纬度范围 "
            f"[{bounding_box['west']:.6f}, {bounding_box['south']:.6f}, "
            f"{bounding_box['east']:.6f}, {bounding_box['north']:.6f}]"
        )
    if not summary["coordinateSystem"]["wkt"]:
        print("⚠️ 影像缺少坐标系信息，切片结果可能无法正确定位")
    if recommended_zoom:
        print(f"   推荐 zoom 范围 {recommended_zoom['min']} - {recommended_zoom['max']}")

    # 用户未指定 --min-zoom 时补上推荐值，否则 GDAL 默认只会生成最大层级
    min_zoom = arguments.min_zoom
    if min_zoom is None and recommended_zoom:
        min_zoom = recommended_zoom["min"]
        print(f"ℹ️ 未指定 --min-zoom，自动使用推荐层级 {min_zoom}")
    max_zoom = arguments.max_zoom
    if min_zoom is not None and max_zoom is not None and min_zoom > max_zoom:
        raise SystemExit(f"❌ --min-zoom({min_zoom}) 不能大于 --max-zoom({max_zoom})")

    # ===== 第二步：执行切片 =====
    tile_command = build_tile_command(
        gdal_executable, arguments, input_path, tiles_dir, min_zoom, max_zoom
    )
    print(f"🚀 执行切片命令：\n   {' '.join(tile_command)}")
    if arguments.dry_run:
        print("ℹ️ --dry-run 已启用，跳过实际切片")
    else:
        run_command(tile_command)

    # ===== 第三步：写出 JSON =====
    metadata = build_metadata(
        arguments, gdal_version, summary, recommended_zoom, min_zoom, max_zoom
    )
    extension = FORMAT_EXTENSIONS.get(arguments.format.upper(), arguments.format.lower())
    if not arguments.dry_run:
        tile_count, zoom_levels = count_tiles(tiles_dir, extension)
        metadata["tiling"]["tileCount"] = tile_count
        metadata["tiling"]["zoomLevels"] = [int(zoom) for zoom in zoom_levels]
        # zoom 交由 GDAL 自动决定时，用实际产物层级回填，保证 metadata 自洽
        if zoom_levels:
            if metadata["tiling"]["minZoom"] is None:
                metadata["tiling"]["minZoom"] = int(zoom_levels[0])
            if metadata["tiling"]["maxZoom"] is None:
                metadata["tiling"]["maxZoom"] = int(zoom_levels[-1])

    write_json(output_dir / GDALINFO_FILE_NAME, raster_info)
    write_json(output_dir / METADATA_FILE_NAME, metadata)

    print(f"\n🎉 切片完成！输出目录：{output_dir}")
    print(f"   ├─ {TILES_DIR_NAME}/            切片数据（{metadata['tiling']['urlTemplate']}）")
    print(f"   ├─ {GDALINFO_FILE_NAME}    gdalinfo 原始输出")
    print(f"   └─ {METADATA_FILE_NAME}    影像摘要与切片参数")
    if not arguments.dry_run:
        print(
            f"   共生成 {metadata['tiling']['tileCount']} 张瓦片，"
            f"层级 {metadata['tiling']['zoomLevels']}"
        )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\n⏹️ 已中断")
