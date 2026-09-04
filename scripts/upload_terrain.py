#!/usr/bin/env python3

"""
此脚本用于上传切片后的 DEM 数据到 S3 服务器

2026年9月4日 - xmzhang - 初始化上传脚本
2026年9月4日 - xmzhang - 上传逻辑修改为并行
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
import fnmatch
import os
import threading

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

# ===== 配置区域（按需修改） =====
RUSTFS_ENDPOINT = "http://localhost:9000"

# 凭据从环境变量读取
ACCESS_KEY = os.getenv("RUSTFS_DEV_ACCESS_KEY")
SECRET_KEY = os.getenv("RUSTFS_DEV_SECRET_KEY")
if not ACCESS_KEY or not SECRET_KEY:
    raise SystemExit(
        "缺少 RUSTFS_DEV_ACCESS_KEY / RUSTFS_DEV_SECRET_KEY 环境变量，"
        "请参考 .env.example 配置后再运行脚本"
    )

BUCKET_NAME = "terrain"
LOCAL_DIR = r"C:\Users\GXRS-201RJ\Documents\guangxi"  # CesiumLab 输出目录
REMOTE_PREFIX = "guangxi"  # RustFS 中的存储路径前缀

# ===== 忽略规则（按需增删；目录会就地过滤，避免继续遍历） =====
# 精确名称匹配：按文件名或文件夹名整体匹配（区分大小写）
IGNORE_NAMES = [
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
    ".git",
    ".gitkeep",
    "node_modules",
]
# Glob 模式匹配：按 fnmatch 规则（如扩展名、通配符），文件名命中即跳过
IGNORE_PATTERNS = [
    "*.tmp",
    "*.bak",
    "*.log",
]

# 并发上传协程数量，按网络与本地磁盘 IO 调整；设为 1 即退化为串行
MAX_WORKERS = 10


# ===== 初始化客户端 =====
s3 = boto3.client(
    "s3",
    endpoint_url=RUSTFS_ENDPOINT,
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    config=Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"},
    ),
    region_name="us-east-1",
)

# ===== 确保存储桶存在（先 HEAD 检查，再按需创建） =====
try:
    s3.head_bucket(Bucket=BUCKET_NAME)
    print(f"ℹ️ 存储桶 {BUCKET_NAME} 已存在")
except ClientError as e:
    # 只有 404 才走创建路径；其他错误（如 403 鉴权失败）原样抛出
    status = e.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    if status != 404:
        raise
    s3.create_bucket(Bucket=BUCKET_NAME)
    print(f"✅ 存储桶 {BUCKET_NAME} 创建成功")

# ===== 递归收集待上传任务 =====
total = 0
skipped = 0
tasks = []  # (local_path, remote_key) 待上传任务列表


def is_ignored(name: str) -> bool:
    """判断文件名/目录名是否命中忽略规则"""
    if name in IGNORE_NAMES:
        return True
    return any(fnmatch.fnmatch(name, p) for p in IGNORE_PATTERNS)


for root, dirs, files in os.walk(LOCAL_DIR):
    # 原地过滤目录列表，os.walk 不会继续进入被剔除的子目录
    dirs[:] = [d for d in dirs if not is_ignored(d)]
    for filename in files:
        if is_ignored(filename):
            skipped += 1
            continue
        local_path = os.path.join(root, filename)
        # 计算相对路径，拼接为远程 key
        relative_path = os.path.relpath(local_path, LOCAL_DIR)
        remote_key = f"{REMOTE_PREFIX}/{relative_path}".replace("\\", "/")
        tasks.append((local_path, remote_key))
        total += 1

# ===== 并发上传 =====
success = 0
failed = 0
counter_lock = threading.Lock()


def upload_one(local_path: str, remote_key: str) -> None:
    """上传单个文件（在线程池中执行）"""
    s3.upload_file(local_path, BUCKET_NAME, remote_key)


with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
    futures = {pool.submit(upload_one, lp, rk): rk for lp, rk in tasks}
    for fut in as_completed(futures):
        remote_key = futures[fut]
        try:
            fut.result()
        except Exception as e:
            with counter_lock:
                failed += 1
            print(f"❌ 上传失败: {remote_key} -> {e}")
        else:
            with counter_lock:
                success += 1
                if success % 100 == 0:
                    print(f"📤 已上传 {success} 个文件...")

print(f"\n🎉 上传完成！总计: {total}, 成功: {success}, 失败: {failed}, 跳过: {skipped}")
