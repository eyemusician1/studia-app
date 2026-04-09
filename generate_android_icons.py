# This script generates Android launcher icons from studia.png and replaces the existing ones.
# Requirements: pip install pillow

import os
from PIL import Image

# Path to your source image
SRC_IMG = os.path.join(os.path.dirname(__file__), 'assets', 'studia.png')

# Android mipmap folders and their required icon sizes
MIPMAPS = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

# Path to the res directory
RES_DIR = os.path.join(os.path.dirname(__file__), 'android', 'app', 'src', 'main', 'res')


# Output file names (both .webp and .png)
ICON_NAMES = [
    'ic_launcher.webp',
    'ic_launcher_round.webp',
    'ic_launcher.png',
    'ic_launcher_round.png',
]

def generate_icons():
    if not os.path.exists(SRC_IMG):
        print(f"Source image not found: {SRC_IMG}")
        return
    img = Image.open(SRC_IMG).convert('RGBA')
    for folder, size in MIPMAPS.items():
        out_dir = os.path.join(RES_DIR, folder)
        if not os.path.exists(out_dir):
            print(f"Warning: {out_dir} does not exist, skipping.")
            continue
        icon = img.resize((size, size), Image.LANCZOS)
        for name in ICON_NAMES:
            out_path = os.path.join(out_dir, name)
            if name.endswith('.webp'):
                icon.save(out_path, 'WEBP')
            else:
                icon.save(out_path, 'PNG')
            print(f"Saved {out_path}")

if __name__ == '__main__':
    generate_icons()
    print("All icons generated and replaced.")
