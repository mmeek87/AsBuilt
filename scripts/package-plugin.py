"""Build both submission archives from an explicit, credential-free allowlist."""
from pathlib import Path
import zipfile
import shutil
import tempfile

root = Path(__file__).resolve().parents[1]
plugin = root / 'plugins' / 'asbuilt'
files = ['plugin.json', '.claude-plugin/plugin.json', 'README.md',
         'scripts/asbuilt.mjs', 'skills/verify-build/SKILL.md',
         'skills/verify-build/references/product-review.md',
         'templates/asbuilt-workflow.yml', 'assets/icon.svg']
out = root / 'release'
out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='asbuilt-package-') as temp:
    archive = Path(temp) / 'asbuilt.plugin'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
        for name in files:
            path = plugin / name
            if path.is_symlink() or not path.is_file():
                raise ValueError(f'Expected a regular plugin file: {name}')
            bundle.write(path, name)
        bundle.write(root / 'LICENSE', 'LICENSE')
    for name in ['asbuilt.plugin', 'asbuilt.zip']:
        shutil.copyfile(archive, out / name)
        print(out / name)
