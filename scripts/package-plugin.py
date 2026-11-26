"""Build the plugin archives from an explicit, credential-free allowlist.

- release/asbuilt.plugin: the Claude plugin (the plugins/asbuilt folder:
  instructions and the workflow template only, no scripts).
- release/asbuilt.zip: the same skill packaged for the OpenAI plugin
  directory, with its agent-plugins manifest and icon from packaging/openai.
"""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
plugin = root / 'plugins' / 'asbuilt'
openai = root / 'packaging' / 'openai'
shared = ['README.md', 'LICENSE', 'skills/verify-build/SKILL.md',
          'skills/verify-build/references/product-review.md',
          'templates/asbuilt-workflow.yml']
claude = [(plugin / n, n) for n in ['.claude-plugin/plugin.json', '.claude-plugin/icon.png', *shared]]
chatgpt = [(plugin / n, n) for n in shared] + [
    (openai / 'plugin.json', 'plugin.json'),
    (openai / 'assets' / 'icon.svg', 'assets/icon.svg'),
]
out = root / 'release'
out.mkdir(exist_ok=True)
for name, entries in [('asbuilt.plugin', claude), ('asbuilt.zip', chatgpt)]:
    with zipfile.ZipFile(out / name, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
        for path, arc in entries:
            if path.is_symlink() or not path.is_file():
                raise ValueError(f'Expected a regular plugin file: {arc}')
            bundle.write(path, arc)
    print(out / name)
