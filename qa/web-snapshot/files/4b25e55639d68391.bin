# obs-manim-like-motion

> **将 Manim 数学动画哲学与动力学曲线引入 OBS Studio 的高质量转场与动效插件。**

> **[📖 English](README.en-us.md)**
> **[📖 简体中文(大陆)](README.md)**

本项目受数学动画引擎 **[Manim (Community Edition)](https://github.com/ManimCommunity/manim)** 启发，将 Manim 标志性的缓动速度曲线（Rate Functions）、几何勾勒与两段式构建动效带入 OBS 场景转场与画面呈现中。

<p align="center">
  <img src="docs/media/preview.gif" alt="obs-manim-motion 实时转场预览" width="720">
</p>

---

## 🌟 核心特性

- **$M \times N$ 笛卡尔积解耦转场架构**：
  - 将转场时间轴解耦为**出场阶段（Exit）**、**微顿歇（Pause）**与**入场阶段（Entrance）**。
  - 用户可在单个转场属性面板中自由搭配任意出场与入场动效，形成灵活组合。
- **退出动效清单（Exit）**：
  - `FadeOut`（动力学加速淡出）：基于 Manim 的 `rush_into` 曲线，配合微缩下沉动力学，干净利落。
  - `Uncreate`（线框反向解构）：画面内部先向外消解，边缘与元素留存高光线稿骨架，随后逆时针/向中心收拢消散。
  - `Unwrite`（倒带式手绘擦除 · v0.3.0）：沿时空流场反向抹除画面，伴随笔尖高光微斑与线稿时差褪色。
- **入场动效清单（Entrance）**：
  - `FadeIn`（动力学阻尼冲入）：基于 Manim 的 `rush_from` 曲线，带有自然的阻尼刹车回弹质感。
  - `Create`（`DrawBorderThenFill` 勾勒后填充）：暗场中先由高光线稿勾勒出所有文字、边框与主体轮廓，随后画面真实色彩如墨水般由内向外注入浸润。
  - `Write`（时空流场手写演算 · v0.3.0）：复刻 Manim 经典的文字手绘推导过程，支持自然逐行横排、折返蛇形、代码瀑布、对角光幕与极坐标螺旋（`SpiralIn`）5 种流向，以及细致的 `lag_ratio` 时差滞后与笔尖火花。
- **GPU 实时几何轮廓素描场（Contour Extraction）**：
  - 采用 3×3 Scharr 梯度卷积算子与频域谐波算法，无需矢量字体或离线预处理，单 Shader Pass 直接在毫秒内将实时画面转换为数学黑板手绘线稿。
  - 提供 **`GPU 实时线稿素描 (XDoG 算子)`**、**`频域傅里叶谐波`** 与 **`关闭 (仅保留外边框)`** 3 种模式下拉切换。
- **线稿高光画风预设矩阵（Color Preset）**：
  - 提供 7 种经典调色预设（水色雾蓝 `#7FA8E8`、冰蓝微光 `#DCEBFF`、经典粉笔白 `#FFFFFF`、黄金流光 `#FFD700`、缎带柔粉 `#F4C6D7`、奶油温白 `#FFF3DE`、赛博霓虹青 `#00FFFF`）以及自定义 RGBA 拾色器。
  - 下拉选单与原生调色板即时联动同步。
- **精细化动力学与节奏调节**：
  - 轮廓提取灵敏度（Contour Sensitivity）、色彩浸润注入延迟（Fill-In Delay）。
  - 出场/入场占比（Timing Split）、顿歇停顿微空隙（Pause Duration）。
  - 边框线条粗细（Border Thickness）、发光强度倍率（Glow Multiplier）。
- **零本地环境负担**：
  - 核心逻辑基于现代 C++20 与 `libobs` 架构，渲染层全由 GPU 像素着色器（HLSL `.effect`）实时处理，开销极低。
  - 依托 GitHub Actions 自动化 CI，覆盖 **Windows x64** 与 **Ubuntu Linux x64** 的云端编译与打包。

---

## 🛠️ 自动化构建与 CI/CD

本项目通过 GitHub Actions 实现了全自动跨平台构建与发布流水线。想要了解 CI 构建流水线触发规则、工作机制，以及各 Release / CI 构建产物的完整内部目录结构，请参阅：
* 📖 [构建与发布流水线及产物目录结构说明 (.github/workflows/build.md)](.github/workflows/build.md)

---

## 🚀 下载与快速上手

### 获取正式发布版（GitHub Releases）
请前往项目的 **[Releases](https://github.com/VincentZyuLive/obs-manim-like-motion/releases)** 页面下载对应系统的最新发布包。

> [!NOTE]
> 想要了解各压缩包（标准安装包、OBS 33+ 模块化包、免管理员权限包、Linux deb/tar.gz）的**内部目录结构与解压目标路径**，请跳转参阅 [构建产物目录结构说明 (.github/workflows/build.md)](.github/workflows/build.md#📦-产物规格与结构说明)。

安装完成后启动 OBS Studio，在右下角 **转场动画** 停靠窗口点击 **`+`** 号选择 **Manim Like** 即可配置使用！

> [!TIP]
> **插件热更新提示**：若在 OBS Studio 正在运行期间替换或更新了插件文件（`.dll`、`.so` 或 `.effect` 资源），**必须重启 OBS Studio** 才能加载最新编译的二进制文件、属性面板配置项及着色器特效。

---

## 📜 开源协议

GPL-2.0-or-later。