import { portraitToLayers, normalizeSoulPortrait } from '../services/soulPortraits.js'

export default function SoulPortrait({ portrait, fields = {}, className = '', size = 'md' }) {
  const normalized = normalizeSoulPortrait(portrait, fields)
  const layers = portraitToLayers(normalized)

  return (
    <div
      className={['app-portrait', `size-${size}`, className].filter(Boolean).join(' ')}
      aria-label="Portrait"
      role="img"
    >
      {layers.map((layer) => (
        <img
          key={layer.id}
          src={layer.src}
          alt=""
          aria-hidden="true"
          className={`app-portrait-layer slot-${layer.slot}`}
          draggable="false"
        />
      ))}
    </div>
  )
}
