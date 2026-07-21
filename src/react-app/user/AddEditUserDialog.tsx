import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import React from 'react'

import { useI18n } from '../i18n'

interface IProps {
  name?: string
  admin?: boolean
  fClose: VoidFunction
  fOnSubmit: (name: string, pass: string, admin: boolean) => Promise<void>
  isEdit?: boolean
}

const AddEditUserDialog = ({
  fClose,
  fOnSubmit,
  isEdit,
  name: initialName = '',
  admin: initialAdmin = false
}: IProps) => {
  const { t } = useI18n()
  const [name, setName] = React.useState(initialName)
  const [pass, setPass] = React.useState('')
  const [admin, setAdmin] = React.useState(initialAdmin)

  const namePresent = name.length !== 0
  const passPresent = pass.length !== 0 || isEdit
  const submitAndClose = async () => {
    await fOnSubmit(name, pass, admin)
    fClose()
  }
  return (
    <Dialog
      open={true}
      onClose={fClose}
      aria-labelledby="form-dialog-title"
      id="add-edit-user-dialog">
      <DialogTitle id="form-dialog-title">
        {isEdit ? t('editUser', { name }) : t('addUser')}
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          className="name"
          label={t('usernameRequired')}
          value={name}
          name="username"
          id="username"
          onChange={(e) => setName(e.target.value)}
          fullWidth
        />
        <TextField
          margin="dense"
          className="password"
          type="password"
          value={pass}
          fullWidth
          label={isEdit ? t('passwordNoChange') : t('passwordFieldRequired')}
          name="password"
          id="password"
          onChange={(e) => setPass(e.target.value)}
        />
        <FormControlLabel
          control={
            <Switch
              checked={admin}
              className="admin-rights"
              onChange={(e) => setAdmin(e.target.checked)}
              value="admin"
            />
          }
          label={t('administratorRights')}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={fClose}>{t('cancel')}</Button>
        <Tooltip
          placement={'bottom-start'}
          title={
            namePresent
              ? passPresent
                ? ''
                : t('passwordRequired')
              : t('usernameRequiredHint')
          }>
          <div>
            <Button
              className="save-create"
              disabled={!passPresent || !namePresent}
              onClick={submitAndClose}
              color="primary"
              variant="contained">
              {isEdit ? t('save') : t('create')}
            </Button>
          </div>
        </Tooltip>
      </DialogActions>
    </Dialog>
  )
}
export default AddEditUserDialog
