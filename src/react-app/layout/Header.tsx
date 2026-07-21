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
import { Theme } from '@mui/material/styles'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import React, { CSSProperties } from 'react'
import { Link } from 'react-router'
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
  const [openPreference, setOpenPreference] = React.useState<
    'language' | 'theme' | null
  >(null)
  const preferenceControls = React.useRef<HTMLDivElement>(null)
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

  React.useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        preferenceControls.current &&
        !preferenceControls.current.contains(event.target as Node)
      ) {
        setOpenPreference(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPreference(null)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

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
        <div className="yume-preference-controls" ref={preferenceControls}>
          <div
            className={`yume-preference-control yume-preference-control--language${
              openPreference === 'language' ? ' is-open' : ''
            }`}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setOpenPreference((current) =>
                  current === 'language' ? null : current
                )
              }
            }}>
            <IconButton
              className="yume-preference-button"
              onClick={() =>
                setOpenPreference((current) =>
                  current === 'language' ? null : 'language'
                )
              }
              color="inherit"
              size="large"
              title={t('language')}
              aria-label={t('language')}
              aria-haspopup="menu"
              aria-controls="yume-language-menu"
              aria-expanded={openPreference === 'language'}>
              <LanguageIcon />
            </IconButton>
            <div
              id="yume-language-menu"
              className="yume-preference-dropdown yume-language-dropdown"
              role="menu"
              aria-label={t('language')}>
              {languageOptions.map(([choice, label]) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={choice === languageChoice}
                  tabIndex={openPreference === 'language' ? 0 : -1}
                  className={`yume-preference-option${
                    choice === languageChoice ? ' is-active' : ''
                  }`}
                  key={choice}
                  lang={choice === 'auto' ? undefined : choice}
                  onClick={() => {
                    setLanguageChoice(choice)
                    setOpenPreference(null)
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div
            className={`yume-preference-control yume-preference-control--theme${
              openPreference === 'theme' ? ' is-open' : ''
            }`}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setOpenPreference((current) =>
                  current === 'theme' ? null : current
                )
              }
            }}>
            <IconButton
              className="yume-preference-button"
              onClick={() =>
                setOpenPreference((current) =>
                  current === 'theme' ? null : 'theme'
                )
              }
              color="inherit"
              size="large"
              title={themeLabel}
              aria-label={themeLabel}
              aria-haspopup="menu"
              aria-controls="yume-theme-menu"
              aria-expanded={openPreference === 'theme'}>
              {themeIcon}
            </IconButton>
            <div
              id="yume-theme-menu"
              className="yume-preference-dropdown yume-theme-dropdown"
              role="menu"
              aria-label={themeLabel}>
              {themeOptions.map(([choice, label]) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={choice === themeMode}
                  tabIndex={openPreference === 'theme' ? 0 : -1}
                  className={`yume-preference-option${
                    choice === themeMode ? ' is-active' : ''
                  }`}
                  key={choice}
                  onClick={() => {
                    setThemeMode(choice)
                    setOpenPreference(null)
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
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
    <div className={`${classes.menuButtons} yume-function-buttons`}>
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
