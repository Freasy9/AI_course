#!/bin/bash
# 监控训练进程，完成后自动同步到 GitHub

cd "$(dirname "$0")/.." || exit 1

MODEL_FILE="public/samples/models/digit-model.json"
PID_FILE="/tmp/train-digit-model.pid"

echo "等待训练完成..."

# 等待训练进程结束（通过进程名匹配）
while pgrep -f "train-digit-model.js" > /dev/null; do
  sleep 30
  echo "$(date '+%H:%M:%S') - 训练进行中..."
done

echo "训练进程已结束，检查模型文件..."

# 等待文件写入完成
sleep 5

if [ -f "$MODEL_FILE" ]; then
  echo "模型文件已生成: $MODEL_FILE"
  echo "文件大小: $(wc -c < "$MODEL_FILE" | xargs) 字节"
  
  # 检查文件是否完整（至少 100KB）
  SIZE=$(wc -c < "$MODEL_FILE" | xargs)
  if [ "$SIZE" -lt 100000 ]; then
    echo "警告: 模型文件可能不完整 (${SIZE} 字节)"
    exit 1
  fi
  
  echo "开始同步到 GitHub..."
  
  # 添加文件
  git add scripts/train-digit-model.js "$MODEL_FILE" package.json public/samples/models/README.md src/components/VisionExplorer.jsx 2>/dev/null
  
  # 提交
  git commit -m "perf(数字模型): 优化训练参数提升准确率

- 样本数: 48 → 150/类 (3倍)
- 训练轮数: 18 → 40 epochs
- 预处理: padding + 对比度增强
- 添加验证集监控过拟合" 2>/dev/null
  
  if [ $? -eq 0 ]; then
    echo "提交成功，推送到远程..."
    git push origin main 2>&1
    
    if [ $? -eq 0 ]; then
      echo "✅ 已成功同步到 GitHub!"
    else
      echo "❌ 推送失败，请手动执行: git push origin main"
    fi
  else
    echo "❌ 提交失败（可能无变更），请检查 git status"
  fi
else
  echo "❌ 模型文件未找到: $MODEL_FILE"
  exit 1
fi
