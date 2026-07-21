import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { useNavigate } from 'react-router'

import Container from '../common/Container'
import DefaultPage from '../common/DefaultPage'
import * as config from '../config'
import { useStores } from '../stores'
import { useI18n } from '../i18n'
import RegistrationDialog from './Register'

const Login = observer(() => {
  const { t } = useI18n()
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [registerDialog, setRegisterDialog] = React.useState(false)
  const { currentUser } = useStores()
  const navigate = useNavigate()
  React.useEffect(() => {
    if (currentUser.loggedIn) {
      navigate('/')
    }
  }, [currentUser.loggedIn])
  const registerButton = () => {
    if (config.get('register'))
      return (
        <Button
          id="register"
          variant="contained"
          color="primary"
          onClick={() => setRegisterDialog(true)}>
          {t('register')}
        </Button>
      )
    else return null
  }
  const login = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    currentUser.login(username, password)
  }
  return (
    <DefaultPage
      title={t('login')}
      rightControl={registerButton()}
      maxWidth={320}>
      <Grid size={{ xs: 12 }} style={{ textAlign: 'center' }}>
        <Container>
          <form
            onSubmit={(e) => e.preventDefault()}
            id="login-form"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <TextField
              autoFocus
              id="username"
              className="name"
              label={t('username')}
              name="username"
              margin="dense"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              fullWidth
            />
            <TextField
              id="password"
              type="password"
              className="password"
              label={t('password')}
              name="password"
              margin="normal"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              className="login"
              color="primary"
              disabled={
                !!currentUser.connectionErrorMessage ||
                currentUser.authenticating
              }
              style={{ marginTop: 15, marginBottom: 5 }}
              loading={currentUser.authenticating}
              onClick={login}>
              {t('login')}
            </Button>
          </form>
        </Container>
      </Grid>
      {registerDialog && (
        <RegistrationDialog
          fClose={() => setRegisterDialog(false)}
          fOnSubmit={currentUser.register}
        />
      )}
    </DefaultPage>
  )
})

export default Login
