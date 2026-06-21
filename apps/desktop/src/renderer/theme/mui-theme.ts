import { createTheme, type Theme } from '@mui/material/styles'

const PRIMARY = '#00a962'
const PRIMARY_DARK = '#009655'
const PRIMARY_LIGHT = '#34d399'

function getPaletteMode(): 'light' | 'dark' {
  return document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light'
}

export function createAppMuiTheme(mode: 'light' | 'dark' = getPaletteMode()): Theme {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: PRIMARY,
        dark: PRIMARY_DARK,
        light: PRIMARY_LIGHT,
        contrastText: '#ffffff',
      },
      background: {
        default: mode === 'dark' ? '#18181b' : '#ffffff',
        paper: mode === 'dark' ? '#27272a' : '#ffffff',
      },
      text: {
        primary: mode === 'dark' ? '#f4f4f5' : '#18181b',
        secondary: mode === 'dark' ? '#a1a1aa' : '#52525b',
      },
      divider: mode === 'dark' ? '#3f3f46' : '#e4e4e7',
    },
    shape: {
      borderRadius: 10,
    },
    typography: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      button: {
        textTransform: 'none',
        fontWeight: 600,
      },
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 10,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: 'small',
          fullWidth: true,
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 10,
          },
        },
      },
    },
  })
}
