# Speaker Notes

## Page 1: PPT 生成 Skill 五条主流路线

本页展示了将图片转换为可编辑 PPT 的五条主流技术路线。

左侧列出了五种前端演示工具：Anthropic pptx（原生可编辑PPTX）、Slidev（开发者演示）、frontend-slides（高视觉HTML）、Reveal.js（成熟Web演示）、html-ppt（主题化互动演示）。

右侧展示了核心转换流程：首先通过 GPT-image 2 生成视觉稿，然后进行 OCR 加版面理解和元素分层，最终实现 PPTX 原生对象重建。

核心观点：可编辑的本质是重建对象，而不是把整页图片放进 PPT。
