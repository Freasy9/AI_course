# 本地识别模型

本目录用于存放**可导入的水果识别模型**等，供「视觉探测器」和「百科解码器」使用。

---

## 生成水果识别模型（推荐）

模型格式与「视觉探测器」导出的 JSON 一致（`weights`、`biases`、`classNames`、`numClasses`），可直接在应用中导入。

### 步骤

1. **准备样本图片**  
   在项目根目录执行：
   ```bash
   npm run download-samples
   ```
   或按 `public/samples/README.md` 说明，在 `public/samples/fruits/` 下按类别建文件夹并放入图片，例如：
   - `fruits/苹果/`：多张苹果图片
   - `fruits/香蕉/`：多张香蕉图片
   - 其他类别：橙子、葡萄、草莓、西瓜、桃子、梨

2. **训练并保存模型**  
   在项目根目录执行：
   ```bash
   npm run train-fruit-model
   ```
   脚本会读取 `public/samples/fruits/` 下的图片，用 MobileNet 提取特征并训练分类头，生成：
   - **输出文件**：`public/samples/models/fruit-model.json`

3. **在应用中导入**  
   - 打开「视觉探测器」或「百科解码器」  
   - 选择「视觉模型」  
   - 点击「导入已保存的模型」或「选择视觉模型文件」  
   - 选择本目录下的 `fruit-model.json` 即可使用。

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `fruit-model.json` | 水果分类头权重。项目内已提供一份**占位模型**（`npm run placeholders:fruit-model` 可重新生成），可直接在应用中导入以跑通流程；识别效果以在应用内用真实样本训练后导出的模型为准。 |
| `README.md` | 本说明。 |

若你已有从「视觉探测器」导出的其他模型 JSON，也可直接放入本目录，便于统一管理和导入。
