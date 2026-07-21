import AccountCircle from '@mui/icons-material/AccountCircle'
import Apps from '@mui/icons-material/Apps'
import Brightness4 from '@mui/icons-material/Brightness4'
import Brightness7 from '@mui/icons-material/Brightness7'
import BrightnessAuto from '@mui/icons-material/BrightnessAuto'
import Chat from '@mui/icons-material/Chat'
import DevicesOther from '@mui/icons-material/DevicesOther'
import ExitToApp from '@mui/icons-material/ExitToApp'
import LanguageIcon from '@mui/icons-material/Translate'
import MenuIcon from '@mui/icons-material/Menu'
import SupervisorAccount from '@mui/icons-material/SupervisorAccount'
import { useMediaQuery } from '@mui/material'
import AppBar from '@mui/material/AppBar'
import Button, { ButtonProps } from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { Theme } from '@mui/material/styles'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import React, { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { makeStyles } from 'tss-react/mui'

import { useI18n } from '../i18n'
import { LanguageChoice, ThemeChoice } from '../preferences'

const themeIcons: Record<ThemeChoice, React.ReactElement> = {
  dark: <Brightness4 />,
  light: <Brightness7 />,
  auto: <BrightnessAuto />
}

const useStyles = makeStyles()((theme: Theme) => ({
  appBar: {
    zIndex: theme.zIndex.drawer + 1,
    [theme.breakpoints.down('sm')]: {
      paddingBottom: 6
    }
  },
  toolbar: {
    justifyContent: 'space-between',
    [theme.breakpoints.down('sm')]: {
      flexWrap: 'wrap'
    }
  },
  menuButtons: {
    display: 'flex',
    [theme.breakpoints.down('md')]: {
      flex: 1
    },
    justifyContent: 'center',
    [theme.breakpoints.down('sm')]: {
      flexBasis: '100%',
      marginTop: 5,
      order: 1,
      height: 50,
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  },
  title: {
    [theme.breakpoints.up('md')]: {
      flex: 1
    },
    display: 'flex',
    alignItems: 'center',
    minWidth: 190
  },
  titleName: {
    paddingRight: 10,
    fontWeight: 720,
    letterSpacing: '-0.025em'
  },
  link: {
    color: 'inherit',
    textDecoration: 'none'
  }
}))

interface IProps {
  loggedIn: boolean
  name: string
  admin: boolean
  version: string
  themeMode: ThemeChoice
  setThemeMode: (theme: ThemeChoice) => void
  showSettings: VoidFunction
  logout: VoidFunction
  style: CSSProperties
  setNavOpen: (open: boolean) => void
}

const Header = ({
  name,
  loggedIn,
  admin,
  setThemeMode,
  logout,
  style,
  setNavOpen,
  showSettings,
  themeMode
}: IProps) => {
  const { classes } = useStyles()
  const { t, languageChoice, setLanguageChoice } = useI18n()
  const [languageAnchor, setLanguageAnchor] =
    React.useState<null | HTMLElement>(null)
  const [themeAnchor, setThemeAnchor] = React.useState<null | HTMLElement>(null)
  const themeLabel = t('theme')
  const themeIcon = themeIcons[themeMode]
  const languageOptions: Array<[LanguageChoice, string]> = [
    ['auto', t('languageAuto')],
    ['en', t('languageEnglish')],
    ['fr', t('languageFrench')],
    ['ja', t('languageJapanese')],
    ['zh-tw', t('languageTraditionalChinese')],
    ['zh-cn', t('languageSimplifiedChinese')]
  ]
  const themeOptions: Array<[ThemeChoice, string]> = [
    ['auto', t('themeAuto')],
    ['dark', t('themeDark')],
    ['light', t('themeLight')]
  ]
  return (
    <AppBar
      sx={{ position: { xs: 'sticky', sm: 'fixed' } }}
      style={style}
      className={`${classes.appBar} yume-app-bar`}>
      <Toolbar className={classes.toolbar}>
        <div className={classes.title}>
          <Link to="/" className={classes.link}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img
                className="yume-brand-logo"
                src="static/yume-logo.png"
                alt=""
                width="42"
                height="42"
              />
              <Typography
                variant="h5"
                className={classes.titleName}
                color="inherit">
                {t('brand')}
              </Typography>
            </span>
          </Link>
        </div>
        {loggedIn && (
          <Buttons
            admin={admin}
            name={name}
            logout={logout}
            setNavOpen={setNavOpen}
            showSettings={showSettings}
          />
        )}
        <div>
          <IconButton
            onClick={(event) => setLanguageAnchor(event.currentTarget)}
            color="inherit"
            size="large"
            title={t('language')}
            aria-label={t('language')}
            aria-haspopup="menu"
            aria-expanded={Boolean(languageAnchor)}>
            <LanguageIcon />
          </IconButton>
          <Menu
            anchorEl={languageAnchor}
            open={Boolean(languageAnchor)}
            onClose={() => setLanguageAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
            {languageOptions.map(([choice, label]) => (
              <MenuItem
                key={choice}
                selected={choice === languageChoice}
                lang={choice === 'auto' ? undefined : choice}
                onClick={() => {
                  setLanguageChoice(choice)
                  setLanguageAnchor(null)
                }}>
                {label}
              </MenuItem>
            ))}
          </Menu>

          <IconButton
            onClick={(event) => setThemeAnchor(event.currentTarget)}
            color="inherit"
            size="large"
            title={themeLabel}
            aria-label={themeLabel}
            aria-haspopup="menu"
            aria-expanded={Boolean(themeAnchor)}>
            {themeIcon}
          </IconButton>
          <Menu
            anchorEl={themeAnchor}
            open={Boolean(themeAnchor)}
            onClose={() => setThemeAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
            {themeOptions.map(([choice, label]) => (
              <MenuItem
                key={choice}
                selected={choice === themeMode}
                onClick={() => {
                  setThemeMode(choice)
                  setThemeAnchor(null)
                }}>
                {label}
              </MenuItem>
            ))}
          </Menu>
        </div>
      </Toolbar>
    </AppBar>
  )
}

const Buttons = ({
  showSettings,
  name,
  admin,
  logout,
  setNavOpen
}: {
  name: string
  admin: boolean
  logout: VoidFunction
  setNavOpen: (open: boolean) => void
  showSettings: VoidFunction
}) => {
  const { classes } = useStyles()
  const { t } = useI18n()

  return (
    <div className={classes.menuButtons}>
      <ResponsiveButton
        sx={{ display: { sm: 'none', xs: 'block' } }}
        icon={<MenuIcon />}
        onClick={() => setNavOpen(true)}
        label={t('menu')}
        color="inherit"
      />
      {admin && (
        <Link className={classes.link} to="/users" id="navigate-users">
          <ResponsiveButton
            icon={<SupervisorAccount />}
            label={t('users')}
            color="inherit"
          />
        </Link>
      )}
      <Link className={classes.link} to="/applications" id="navigate-apps">
        <ResponsiveButton
          icon={<Chat />}
          label={t('applications')}
          color="inherit"
        />
      </Link>
      <Link className={classes.link} to="/clients" id="navigate-clients">
        <ResponsiveButton
          icon={<DevicesOther />}
          label={t('clients')}
          color="inherit"
        />
      </Link>
      <Link className={classes.link} to="/plugins" id="navigate-plugins">
        <ResponsiveButton
          icon={<Apps />}
          label={t('plugins')}
          color="inherit"
        />
      </Link>
      <ResponsiveButton
        icon={<AccountCircle />}
        label={name || t('account')}
        onClick={showSettings}
        id="changepw"
        color="inherit"
      />
      <ResponsiveButton
        icon={<ExitToApp />}
        label={t('logout')}
        onClick={logout}
        id="logout"
        color="inherit"
      />
    </div>
  )
}

const ResponsiveButton: React.FC<{
  color: 'inherit'
  sx?: ButtonProps['sx']
  label: string
  id?: string
  onClick?: () => void
  icon: React.ReactNode
}> = ({ icon, label, ...rest }) => {
  const matches = useMediaQuery('(max-width:1000px)')
  if (matches) {
    return (
      <IconButton {...rest} size="large" aria-label={label} title={label}>
        {icon}
      </IconButton>
    )
  }
  return (
    <Button startIcon={icon} {...rest}>
      {label}
    </Button>
  )
}

export default Header
