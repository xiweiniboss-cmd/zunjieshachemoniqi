# REDLINE · 刹车大师

参考 [breakbreak.app](https://breakbreak.app/) 的刹停计时玩法制作的独立网页小游戏。

## 运行截图

桌面端：

![REDLINE 刹车大师桌面端运行截图](docs/screenshots/desktop.jpg)

手机端：

<img src="docs/screenshots/mobile.jpg" alt="REDLINE 刹车大师手机端运行截图" width="340" />

## GitHub Pages

推送到 `main` 会通过 GitHub Actions 自动测试并部署。网站仅发布运行所需的 HTML、CSS、JavaScript 与图标；本地启动服务和测试文件保留在源码仓库中。

## 启动

不需要安装依赖，需要 Node.js 18 或更新版本：

```sh
npm start
```

打开 http://127.0.0.1:4173。可以用 `PORT=8080 npm start` 更换端口。

## 玩法

- 点击「开始挑战」，倒计时后车辆自动加速。
- 首次达到 100 km/h 时开始计时，提前刹车会失败。
- 按住屏幕踏板或空格增加力度，松开后力度逐渐回落。
- 控制力度在 1600 N 以下，尽快刹停到 0。总成绩包含反应时间。
- `R` 重试，`P` / `Esc` 暂停，`M` 切换声音。切换窗口自动暂停。

成功成绩保存在当前浏览器的 localStorage，显示本地 TOP 50 和个人最佳。没有全球榜单或线上提交。

## 验证

```sh
npm test
```

游戏使用原生 HTML、CSS、JavaScript、Canvas 与 Web Audio，赛道动画和驾驶舱由代码绘制。字体由 Google Fonts 提供，离线时使用本机字体。物理为游戏化简化模型。

已验证 13 项物理测试；在浏览器中完成倒计时、提前刹车失败、1600 N 踏板断裂、真实键盘控力停车、成绩保存与刷新恢复、暂停／继续、说明弹窗以及 390×844 和 375×667 手机布局检查。浏览器实测一次正常刹停为 4.168 秒，反应时间 0.081 秒，峰值力度 1354 N。
