import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp'
import Fab from '@mui/material/Fab'
import React from 'react'

import { useI18n } from '../i18n'

const ScrollUpButton = () => {
  const { t } = useI18n()
  const [state, setState] = React.useState({ display: 'none', opacity: 0 })
  React.useEffect(() => {
    const scrollHandler = () => {
      const currentScrollPos = Math.max(window.pageYOffset - 1000, 0)
      const opacity = Math.min(currentScrollPos / 1000, 1)
      const nextState = {
        display: currentScrollPos > 0 ? 'inherit' : 'none',
        opacity
      }
      if (
        state.display !== nextState.display ||
        state.opacity !== nextState.opacity
      ) {
        setState(nextState)
      }
    }
    window.addEventListener('scroll', scrollHandler)
    return () => window.removeEventListener('scroll', scrollHandler)
  }, [])

  return (
    <Fab
      color="primary"
      style={{
        position: 'fixed',
        bottom: '30px',
        right: '30px',
        zIndex: 100000,
        display: state.display,
        opacity: state.opacity
      }}
      title={t('scrollToTop')}
      aria-label={t('scrollToTop')}
      onClick={() => window.scrollTo(0, 0)}>
      <KeyboardArrowUp />
    </Fab>
  )
}

export default ScrollUpButton
