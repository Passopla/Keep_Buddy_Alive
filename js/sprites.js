// ─── Sprite Sheet Definitions ────────────────────────────────
// Each entry maps an animation name to its spritesheet metadata.
// fw/fh = frame width/height in pixels
// frames = total number of frames in the sheet

export const SPRITE_CONFIG = {
  Clean_Idle:  { file: 'Sprites/Clean_Idle.png',  frames: 8,  fw: 208, fh: 208, fps: 8  },
  Dirty_Idle:  { file: 'Sprites/Dirty_Idle.png',  frames: 8,  fw: 208, fh: 208, fps: 8  },
  Clean_Sit:   { file: 'Sprites/Clean_Sit.png',   frames: 8,  fw: 208, fh: 208, fps: 8  },
  Dirty_Sit:   { file: 'Sprites/Dirty_Sit.png',   frames: 8,  fw: 208, fh: 208, fps: 8  },
  Clean_Eat:   { file: 'Sprites/Clean_Eat.png',   frames: 8,  fw: 208, fh: 208, fps: 8  },
  Dirty_Eat:   { file: 'Sprites/Dirty_Eat.png',   frames: 8,  fw: 208, fh: 208, fps: 8  },
  Clean_Drink: { file: 'Sprites/Clean_Drink.png', frames: 16, fw: 208, fh: 208, fps: 12 },
  Dirty_Drink: { file: 'Sprites/Dirty_Drink.png', frames: 16, fw: 208, fh: 208, fps: 12 },
  Clean_Sleep: { file: 'Sprites/Clean_Sleep.png', frames: 8,  fw: 208, fh: 208, fps: 6, yOffset: 60 },
  Dirty_Sleep: { file: 'Sprites/Dirty_Sleep.png', frames: 8,  fw: 208, fh: 208, fps: 6, yOffset: 60 },
};

// ─── Preloader ────────────────────────────────────────────────
// Returns a promise that resolves to a map of { animName -> HTMLImageElement }

export function preloadSprites() {
  const images = {};
  const entries = Object.entries(SPRITE_CONFIG);

  const promises = entries.map(([key, cfg]) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => { images[key] = img; resolve(); };
      img.onerror = () => reject(new Error(`Failed to load sprite: ${cfg.file}`));
      img.src = cfg.file;
    });
  });

  return Promise.all(promises).then(() => images);
}