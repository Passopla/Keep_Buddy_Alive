from pathlib import Path
from PIL import Image

folder = Path(__file__).resolve().parent.parent / 'Sprites'
for p in sorted(folder.glob('*.png')):
    with Image.open(p) as im:
        print(p.name, im.size)
