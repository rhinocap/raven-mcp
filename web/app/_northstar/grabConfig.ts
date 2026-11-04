// Grab's standalone config for the Northstar wireframe, shared by /raven-design and /motion.
export const ravenGrabConfig = {
  mode: 'standalone',
  // Names the wireframe, not the marketing site. Left unset the overlay falls back to
  // document.title ("Raven Design — Live Demo | RavenMCP"), which reads as Raven talking
  // about itself and truncates at 28 characters. On a real dev server this slot holds the
  // visitor's own project, so the demo has to show someone else's name in it.
  projectName: 'Northstar Workspace',
  // cssVar must match the --demo-* custom properties on .playground-wireframe,
  // or the overlay can't map grabbed declarations back to these tokens.
  tokens: {
    'colors.accent': { value: '#00BFFF', cssVar: '--demo-colors-accent' },
    'colors.primary': { value: '#F0F0F2', cssVar: '--demo-colors-primary' },
    'colors.surface': { value: '#212129', cssVar: '--demo-colors-surface' },
    'colors.surface-raised': { value: '#2A2A33', cssVar: '--demo-colors-surface-raised' },
    'colors.muted': { value: '#9498A0', cssVar: '--demo-colors-muted' },
    'colors.line': { value: 'rgba(240, 240, 242, 0.12)', cssVar: '--demo-colors-line' },
    'rounded.sm': { value: '6px', cssVar: '--demo-rounded-sm' },
    'rounded.md': { value: '12px', cssVar: '--demo-rounded-md' },
    'rounded.lg': { value: '20px', cssVar: '--demo-rounded-lg' },
    'spacing.xs': { value: '4px', cssVar: '--demo-spacing-xs' },
    'spacing.sm': { value: '8px', cssVar: '--demo-spacing-sm' },
    'spacing.md': { value: '16px', cssVar: '--demo-spacing-md' },
    'spacing.lg': { value: '24px', cssVar: '--demo-spacing-lg' },
    'spacing.xl': { value: '40px', cssVar: '--demo-spacing-xl' },
    'text.family': { value: 'Arial, sans-serif', cssVar: '--demo-text-family' },
    'text.display.size': { value: '30px', cssVar: '--demo-text-display-size' },
    'text.display.line-height': { value: '1.1', cssVar: '--demo-text-display-line-height' },
    'text.display.weight': { value: '600', cssVar: '--demo-text-display-weight' },
    'text.title.size': { value: '18px', cssVar: '--demo-text-title-size' },
    'text.title.line-height': { value: '1.3', cssVar: '--demo-text-title-line-height' },
    'text.title.weight': { value: '600', cssVar: '--demo-text-title-weight' },
    'text.body.size': { value: '14px', cssVar: '--demo-text-body-size' },
    'text.body.line-height': { value: '1.6', cssVar: '--demo-text-body-line-height' },
    'text.body.weight': { value: '400', cssVar: '--demo-text-body-weight' },
    'text.caption.size': { value: '12px', cssVar: '--demo-text-caption-size' },
    'text.caption.line-height': { value: '1.4', cssVar: '--demo-text-caption-line-height' },
    'text.caption.weight': { value: '400', cssVar: '--demo-text-caption-weight' },
  },
  grabEndpoint: null,
  componentRequestEndpoint: '/api/component-request',
  componentRequestFlow: 'email',
}
