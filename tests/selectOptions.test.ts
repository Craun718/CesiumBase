import assert from "node:assert/strict"
import { test } from "node:test"
import {
  EMPTY_SELECT_VALUE,
  fromSelectControlValue,
  toSelectControlOptions,
  toSelectControlValue,
  withEmptyOption,
  type SelectOption,
} from "../src/components/base/selectOptions.js"

const categoryOptions: SelectOption[] = [
  { value: "category-imagery", label: "影像" },
  { value: "category-vector", label: "矢量", disabled: true },
]

test("withEmptyOption 把空值项插到最前面", () => {
  const options = withEmptyOption(categoryOptions, "未分类")

  assert.deepEqual(
    options.map((option) => [option.value, option.label]),
    [
      ["", "未分类"],
      ["category-imagery", "影像"],
      ["category-vector", "矢量"],
    ],
  )
})

test("toSelectControlOptions 不把空值选项交给 Reka", () => {
  const options = toSelectControlOptions(withEmptyOption(categoryOptions, "未分类"))

  // Reka 的 SelectItem 收到空串会在渲染时抛错，这里挡住这条回归。
  assert.equal(
    options.some((option) => option.value === ""),
    false,
  )
})

test("toSelectControlOptions 只替换空值项，其余字段与顺序保持不变", () => {
  const options = toSelectControlOptions(withEmptyOption(categoryOptions, "未分类"))

  assert.deepEqual(options, [
    { value: EMPTY_SELECT_VALUE, label: "未分类" },
    { value: "category-imagery", label: "影像" },
    { value: "category-vector", label: "矢量", disabled: true },
  ])
})

test("toSelectControlValue 把空串换成哨兵值，其余原样透传", () => {
  assert.equal(toSelectControlValue(""), EMPTY_SELECT_VALUE)
  assert.equal(toSelectControlValue("category-imagery"), "category-imagery")
  assert.equal(toSelectControlValue(undefined), undefined)
})

test("fromSelectControlValue 把哨兵值和空值都还原成空串", () => {
  assert.equal(fromSelectControlValue(EMPTY_SELECT_VALUE), "")
  assert.equal(fromSelectControlValue(null), "")
  assert.equal(fromSelectControlValue(undefined), "")
  assert.equal(fromSelectControlValue("category-imagery"), "category-imagery")
})

test("空值选项在控件两侧翻译后能原样往返", () => {
  const values = ["", "category-imagery", "all"]

  assert.deepEqual(
    values.map((value) => fromSelectControlValue(toSelectControlValue(value))),
    values,
  )
})
