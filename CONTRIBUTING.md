<h1 align="center">🛠 Contributing to the goome site 🛠</h1>

<p align="center">
The <a href="https://github.com/goome-ui/.github/blob/main/CONTRIBUTING.md">org contributing guide</a> counts here too, this is the website stuff on top.<br>
Small PRs that fix one thing please. Phone fixes, broken links and wording that reads wrong are the best ones to send.
</p>

<details>
<summary align="center"><b>📋 The short version 📋</b></summary>

<p align="center">
• One fix or one new page per PR<br>
• PRs go against <b>dev</b>, not main<br>
• Run <code>python3 build.py --out dist --strict</code> before you send it, a broken link fails the build<br>
• Look at your change in a phone sized window, small screens matter here<br>
• No frameworks and no build tools, plain html, css and js<br>
• Screenshots are real goome output, never mockups<br>
• Dont hardcode versions, the install table reads them from the registries<br>
• AI is fine, but say you used it, and you need to know what every line says
</p>
</details>

<details>
<summary align="center"><b>🏗 Building It 🏗</b></summary>

<p align="center">
You need Python 3 with <code>markdown</code>, <code>pygments</code> and <code>yaml</code> (on Debian and Ubuntu that is <code>python3-markdown python3-pygments python3-yaml</code>).
</p>

```sh
python3 build.py --out dist --docs ../docs
python3 -m http.server -d dist
```

<p align="center">
<code>--docs</code> is a checkout of the <a href="https://github.com/goome-ui/docs">docs repo</a>, leave it out and the build downloads the docs <code>main</code> branch. <code>--strict</code> makes any broken link or anchor an error, which is what CI does.<br> <br>
The builder tests are plain node scripts in <code>tests/</code>, run them with <code>node tests/codegen_zig.test.js</code> and so on.
</p>
</details>

<details>
<summary align="center"><b>📄 Pages And Docs 📄</b></summary>

<p align="center">
A page of the site itself is an html file in <code>src/pages</code> that starts with a <code>&lt;!--meta {"title": "...", "description": "..."} --&gt;</code> line. The header, footer and head come from <code>src/partials</code>.<br> <br>
Docs pages are not made here. Those are markdown in the docs repo, send docs fixes and new docs pages there. This repo only decides how they look.
</p>
</details>

<details>
<summary align="center"><b>📱 Phones 📱</b></summary>

<p align="center">
Buttons need to be easy to hit: 36px for icon buttons, 44px for the big tappable stuff. Nothing should scroll sideways, get cut off or hide behind something at 320px wide.<br> <br>
Dont use words like banner, ad, popup or promo in class names or ids, some browsers hide those parts of the page.
</p>
</details>

<details>
<summary align="center"><b>🔤 Fonts And Pictures 🔤</b></summary>

<p align="center">
Fonts are self hosted in <code>src/assets/fonts</code> with their license next to them, dont load anything from a CDN. New fonts have to be open source and you need to say where they came from in the PR.<br> <br>
Pictures should be webp and small. If its a goome screenshot say which program made it so it can be made again.
</p>
</details>

<details>
<summary align="center"><b>✅ Before You Send ✅</b></summary>

<p align="center">
☐ It builds with <code>--strict</code><br>
☐ The builder tests still pass if you touched <code>src/builder</code><br>
☐ You looked at it on a small screen<br>
☐ The PR says what changed and why, with a screenshot for anything you can see
</p>
</details>

<details>
<summary align="center"><b>📜 License 📜</b></summary>

<p align="center">
The site is under the <a href="LICENSE">GPL-3.0</a>, same as goome. By sending a PR you agree your changes come under it too.
</p>
</details>
