import CloseIcon from '@mui/icons-material/Close'
import {
  Button,
  IconButton,
  Typography,
  ListItemText,
  ListItemAvatar,
  Avatar,
  ListItemButton
} from '@mui/material'
import { DrawerProps } from '@mui/material'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import { Theme } from '@mui/material/styles'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Link } from 'react-router'
import { makeStyles } from 'tss-react/mui'

import {
  mayAllowPermission,
  requestPermission
} from '../snack/browserNotification'
import { useStores } from '../stores'
import { useI18n } from '../i18n'

const useStyles = makeStyles()((theme: Theme) => ({
  root: {
    height: '100%'
  },
  drawerPaper: {
    position: 'relative',
    width: 250,
    minHeight: '100%',
    height: '100vh'
  },
  // eslint-disable-next-line
  toolbar: theme.mixins.toolbar as any,
  link: {
    color: 'inherit',
    textDecoration: 'none'
  }
}))

interface IProps {
  loggedIn: boolean
  navOpen: boolean
  setNavOpen: (open: boolean) => void
}

const Navigation = observer(({ loggedIn, navOpen, setNavOpen }: IProps) => {
  const [showRequestNotification, setShowRequestNotification] =
    React.useState(mayAllowPermission)
  const { classes } = useStyles()
  const { appStore } = useStores()
  const { t } = useI18n()
  const apps = appStore.getItems()

  const userApps =
    apps.length === 0
      ? null
      : apps.map((app) => (
          <Link
            onClick={() => setNavOpen(false)}
            className={`${classes.link} item`}
            to={'/messages/' + app.id}
            key={app.id}>
            <ListItemButton>
              <ListItemAvatar style={{ minWidth: 42 }}>
                <Avatar
                  style={{ width: 32, height: 32 }}
                  src={app.image}
                  variant="square"
                />
              </ListItemAvatar>
              <ListItemText primary={app.name} />
            </ListItemButton>
          </Link>
        ))

  const placeholderItems = [
    <ListItemButton disabled key={-1}>
      <ListItemText primary={t('sampleServer')} />
    </ListItemButton>,
    <ListItemButton disabled key={-2}>
      <ListItemText primary={t('sampleDevice')} />
    </ListItemButton>
  ]

  return (
    <ResponsiveDrawer
      classes={{ root: classes.root, paper: classes.drawerPaper }}
      navOpen={navOpen}
      setNavOpen={setNavOpen}
      id="message-navigation">
      <div className={`${classes.toolbar} yume-nav-spacer`} />
      <Link className={classes.link} to="/" onClick={() => setNavOpen(false)}>
        <ListItemButton disabled={!loggedIn} className="all">
          <ListItemText primary={t('allMessages')} />
        </ListItemButton>
      </Link>
      <Divider />
      <div>{loggedIn ? userApps : placeholderItems}</div>
      <Divider />
      <Typography align="center" style={{ marginTop: 10 }}>
        {showRequestNotification ? (
          <Button
            onClick={() => {
              requestPermission()
              setShowRequestNotification(false)
            }}>
            {t('enableNotifications')}
          </Button>
        ) : null}
      </Typography>
    </ResponsiveDrawer>
  )
})

const ResponsiveDrawer: React.FC<
  DrawerProps & { navOpen: boolean; setNavOpen: (open: boolean) => void }
> = ({ navOpen, setNavOpen, children, ...rest }) => {
  const { t } = useI18n()
  return (
    <>
      <Drawer
        sx={{ display: { sm: 'none', xs: 'block' } }}
        variant="temporary"
        open={navOpen}
        {...rest}>
        <IconButton
          onClick={() => setNavOpen(false)}
          size="large"
          aria-label={t('cancel')}>
          <CloseIcon />
        </IconButton>
        {children}
      </Drawer>
      <Drawer
        sx={{ display: { xs: 'none', sm: 'block' } }}
        variant="permanent"
        {...rest}>
        {children}
      </Drawer>
    </>
  )
}

export default Navigation
