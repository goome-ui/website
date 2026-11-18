<p align="center">
  <img src="https://raw.githubusercontent.com/goome-ui/.github/main/profile/logo.png" alt="goome" width="120">
</p>

<h1 align="center">🌐 goome.wtf 🌐</h1>

<p align="center">
<b>The source of the goome website. Landing page, the docs, the UI builder and the badges, all plain static files.</b>
</p>

<p align="center">
  <img src="https://goome.wtf/badges/made-with-goome-flat.svg" alt="made with goome">
  <img src="https://goome.wtf/badges/prs-go-to-dev.svg" alt="PRs go to dev">
  <img src="https://img.shields.io/badge/python-no%20pip-1b1d22?style=flat-square&logo=python&logoColor=white" alt="python, no pip">
  <img src="https://img.shields.io/badge/license-GPL--3.0-1b1d22?style=flat-square" alt="GPL-3.0">
</p>

<p align="center">
  This is everything behind <a href="https://goome.wtf">goome.wtf</a>. One python script builds it, theres no node, no framework and no bundler, so you can read the whole thing in an afternoon.<br>
  The docs arent in here, they live in <a href="https://github.com/goome-ui/docs">goome-ui/docs</a> as markdown and this repo turns them into pages.<br> <br>
  Found a typo, a broken link or something that looks bad on your phone? Thats exactly what this repo is for.<br> <br>
  Do you like this project? If so, please let me know!
  <a href="https://sevvy-wevvy.com/discord">Discord</a>
</p>

<p align="center">
  <a href="https://goome.wtf/docs/">Docs</a> &nbsp;·&nbsp;
  <a href="https://goome.wtf/builder/">UI Builder</a> &nbsp;·&nbsp;
  <a href="https://github.com/goome-ui/docs">Docs repo</a> &nbsp;·&nbsp;
  <a href="https://github.com/goome-ui/c-goome">c-goome</a>
</p>

<details>
<summary align="center"><b>🔨 Build It 🔨</b></summary>

<br>

<p align="center">
You need python 3 and three packages, <code>python3-markdown</code>, <code>python3-pygments</code> and <code>python3-yaml</code>. On Debian and Ubuntu its one apt line, no pip and no venv.
</p>

```sh
sudo apt install python3-markdown python3-pygments python3-yaml
git clone https://github.com/goome-ui/website
cd website
python3 build.py --out dist
python3 -m http.server -d dist
```

<p align="center">
Open <code>localhost:8000</code> and thats the site. Every link is relative so you can also put the <code>dist</code> folder anywhere, even a subfolder, and it still works.
</p>

<p align="center">
<code>--docs path/to/docs</code> builds from a docs checkout you have on disk, handy when you are editing a docs page and want to see it on the real site.<br>
Leave it out and the docs <code>main</code> branch gets downloaded from GitHub. <code>--docs-ref</code> takes a branch name or a commit.<br>
<code>--strict</code> makes the build fail when one of the site pages has a broken link. A broken link inside a docs page only warns, so a typo over there cant block the site.
</p>
</details>

<details>
<summary align="center"><b>🗂 What Is Where 🗂</b></summary>

<br>

<p align="center">
<code>build.py</code> the whole build<br>
<code>src/pages</code> the landing page, the themes page and the 404<br>
<code>src/partials</code> the head, header and footer that every page shares<br>
<code>src/templates</code> the layout of a docs page<br>
<code>src/assets</code> css, js, fonts and the pictures<br>
<code>src/builder</code> the UI builder, it runs real goome as WebAssembly<br>
<code>src/demos</code> the Brickout and Tidy demos<br>
<code>tools/badges.py</code> draws the badges<br>
<code>tools/versions.py</code> looks up the newest versions for the install table<br>
<code>tests</code> the builder code generator tests
</p>
</details>

<details>
<summary align="center"><b>📚 How The Docs Get Here 📚</b></summary>

<br>

<p align="center">
The docs repo is just <code>pages/*.md</code> plus a <code>nav.yml</code> that says what goes in the sidebar and under which heading.<br>
<code>build.py</code> renders every page to <code>/docs/&lt;name&gt;/</code>, adds the sidebar, a page index on the right, search and the language tabs (code blocks for different languages that sit right after each other turn into one tabbed box).<br>
Links like <code>start-c.md</code> or <code>https://goome.wtf/docs/start-c/</code> both end up pointing at the built page, and the build checks every link and anchor.
</p>

<p align="center">
<b>Adding a docs page</b> doesnt happen here. Add the markdown file and a line in <code>nav.yml</code> over in the docs repo.<br>
<b>Adding a page to the site itself</b> means a new html file in <code>src/pages</code>. Start the file with a line like <code>&lt;!--meta {"title": "Hello - goome", "description": "..."} --&gt;</code>, put <code>{{&gt; head}}</code>, <code>{{&gt; header}}</code> and <code>{{&gt; footer}}</code> in it the same way <code>themes.html</code> does, and it shows up at <code>/hello/</code>. Use <code>{{root}}</code> in front of links so they stay relative.
</p>
</details>

<details>
<summary align="center"><b>🏷 Badges 🏷</b></summary>

<br>

<p align="center">
The badges at <code>goome.wtf/badges/</code> are drawn by <code>tools/badges.py</code>, no shields.io involved, so they match the site. Dark text on goome green, in the five usual styles.<br>
To add one, put a line in the <code>BADGES</code> list and build, it comes out as <code>badges/&lt;name&gt;.svg</code>. The ones people can copy onto their own projects are on the <a href="https://goome.wtf/docs/badges/">Badges page</a>.
</p>
</details>

<details>
<summary align="center"><b>🎨 Themes Gallery 🎨</b></summary>

<br>

<p align="center">
Theres a placeholder page at <code>/themes/</code> for now. The plan is a place to browse goome themes with a live preview, download them and upload your own.<br>
If you want to help build it, say so in <a href="https://github.com/goome-ui/c-goome/discussions">Discussions</a>.
</p>
</details>

<details>
<summary align="center"><b>🛠 Pull Requests 🛠</b></summary>

<br>

<p align="center">
Want to help with the site? Make a pull request to <b>dev</b>!<br>
Small fixes are the easiest to merge, for anything bigger open an issue first so we can talk about it. Phone fixes are very welcome, try it on a small screen before you send it. The details are in <a href="CONTRIBUTING.md">CONTRIBUTING.md</a>.<br> <br>
No frameworks and no build tools please, keep it plain html, css and js. As long as it builds and looks fine in a small window its very likely to get accepted!<br> <br>
CI builds the site and runs the tests on every push and pull request, run <code>python3 build.py --out dist --strict</code> yourself first and you will know how it goes.
</p>
</details>

<details>
<summary align="center"><b>🔤 Credits 🔤</b></summary>

<br>

<p align="center">
Headings are set in <a href="https://fonts.google.com/specimen/Fredoka">Fredoka</a>, text in <a href="https://fonts.google.com/specimen/Hanken+Grotesk">Hanken Grotesk</a> and code in <a href="https://www.jetbrains.com/lp/mono/">JetBrains Mono</a>. All three are under the SIL Open Font License, the license files are next to the fonts in <code>src/assets/fonts</code>.<br>
Code highlighting is <a href="https://pygments.org/">Pygments</a> and the markdown is <a href="https://python-markdown.github.io/">Python-Markdown</a>.
</p>
</details>

<details>
<summary align="center"><b>📜 License 📜</b></summary>

<br>

<p align="center">
This site is under the <a href="LICENSE">GPL-3.0</a>, same as goome.<br> <br>
<sub>
• You can use it, change it and share it<br>
• If you share something made with it, you have to share your source too, under the same license<br>
• Keep the credits
</sub><br> <br>
In short: play fair, keep it open, and give credit where it's due.
</p>
</details>
