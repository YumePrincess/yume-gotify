import { createTheme, PaletteMode } from '@mui/material/styles'

export const createYumeTheme = (mode: PaletteMode) =>
  createTheme({
    palette: {
      mode,
      primary: {
        main: mode === 'dark' ? '#f0cf8a' : '#245f72',
        contrastText: mode === 'dark' ? '#172131' : '#ffffff'
      },
      secondary: { main: mode === 'dark' ? '#e6a5b4' : '#9a415d' },
      background: { default: 'transparent', paper: 'transparent' },
      text: {
        primary: mode === 'dark' ? '#f4f6fb' : '#1b2f4d',
        secondary:
          mode === 'dark' ? 'rgba(244,246,251,.72)' : 'rgba(27,47,77,.7)'
      }
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily:
        "MiSans, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      h4: { fontWeight: 720, letterSpacing: '-0.025em', lineHeight: 1.12 },
      h5: { fontWeight: 680, letterSpacing: '-0.018em', lineHeight: 1.2 },
      button: {
        fontWeight: 680,
        letterSpacing: '0.01em',
        textTransform: 'none'
      }
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { color: 'var(--site-text)', backgroundColor: 'transparent' }
        }
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 'var(--glass-radius-control)',
            minHeight: 40,
            border: '1px solid transparent',
            transition:
              'transform 120ms ease, background-color 180ms ease, box-shadow 180ms ease'
          },
          contained: {
            color: 'var(--site-text)',
            borderColor: 'var(--glass-border)',
            background: 'var(--glass-control-tint)',
            boxShadow: 'var(--glass-control-shine)',
            backdropFilter: 'var(--glass-backdrop)',
            '&:hover': {
              borderColor: 'var(--glass-accent-border)',
              background: 'var(--glass-hover)',
              boxShadow: 'var(--glass-menu-hover-shadow)'
            },
            '&.Mui-disabled': {
              borderColor: 'var(--glass-border)',
              background: 'var(--glass-control-tint)'
            }
          },
          outlined: {
            borderColor: 'var(--glass-border)',
            background: 'var(--glass-control-tint)',
            boxShadow: 'var(--glass-control-shine)',
            '&:hover': {
              borderColor: 'var(--glass-accent-border)',
              background: 'var(--glass-hover)'
            }
          }
        }
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            border: '1px solid transparent',
            borderRadius: 'var(--glass-radius-pill)',
            transition:
              'transform 120ms ease, background-color 180ms ease, color 180ms ease',
            '&:hover': {
              borderColor: 'var(--glass-border)',
              backgroundColor: 'var(--glass-hover)'
            }
          }
        }
      },
      MuiPaper: { defaultProps: { elevation: 0 } },
      MuiTextField: { defaultProps: { variant: 'outlined' } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 'var(--glass-radius-control)',
            background: 'var(--glass-control-tint)',
            boxShadow: 'var(--glass-control-shine)',
            transition:
              'background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
            '&:hover': { background: 'var(--glass-hover)' },
            '&.Mui-focused': {
              background: 'var(--glass-control-focus)',
              boxShadow:
                '0 0 0 3px var(--glass-focus-shadow), var(--glass-control-shine)'
            }
          }
        }
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: 'var(--glass-border)' }
        }
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: 'var(--glass-border)' }
        }
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 'var(--glass-radius-large)' }
        }
      },
      MuiMenu: {
        styleOverrides: {
          paper: { borderRadius: 'var(--glass-radius)' },
          list: { padding: 6 }
        }
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--glass-radius-control)',
            background:
              mode === 'dark' ? 'rgba(17,22,32,.92)' : 'rgba(27,47,77,.92)',
            fontSize: '0.78rem'
          }
        }
      },
      MuiFab: {
        styleOverrides: {
          root: {
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--glass-radius-pill)',
            background: 'var(--glass-tint)',
            color: 'var(--site-text)',
            boxShadow: 'var(--glass-shadow), var(--glass-shine)',
            backdropFilter: 'var(--glass-floating-backdrop)'
          }
        }
      }
    }
  })
