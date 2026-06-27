import 'react'
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'raven-nav': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'raven-footer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}
