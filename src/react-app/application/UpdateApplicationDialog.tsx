import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import { useState } from 'react'

import { NumberField } from '../common/NumberField'
import { useI18n } from '../i18n'

interface IProps {
  fClose: VoidFunction
  fOnSubmit: (
    name: string,
    description: string,
    defaultPriority: number
  ) => Promise<void>
  initialName: string
  initialDescription: string
  initialDefaultPriority: number
}

export const UpdateApplicationDialog = ({
  initialName,
  initialDescription,
  initialDefaultPriority,
  fClose,
  fOnSubmit
}: IProps) => {
  const { t } = useI18n()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [defaultPriority, setDefaultPriority] = useState(initialDefaultPriority)

  const submitEnabled = name.length !== 0
  const submitAndClose = async () => {
    await fOnSubmit(name, description, defaultPriority)
    fClose()
  }

  return (
    <Dialog
      open={true}
      onClose={fClose}
      aria-labelledby="form-dialog-title"
      id="app-dialog">
      <DialogTitle id="form-dialog-title">
        {t('updateApplicationTitle')}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>{t('applicationHelp')}</DialogContentText>
        <TextField
          autoFocus
          margin="dense"
          className="name"
          label={t('nameRequired')}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
        />
        <TextField
          margin="dense"
          className="description"
          label={t('shortDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          multiline
        />
        <NumberField
          margin="dense"
          className="priority"
          label={t('defaultPriority')}
          value={defaultPriority}
          onChange={(e) => setDefaultPriority(e)}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={fClose}>{t('cancel')}</Button>
        <Tooltip title={submitEnabled ? '' : t('nameRequiredHint')}>
          <div>
            <Button
              className="update"
              disabled={!submitEnabled}
              onClick={submitAndClose}
              color="primary"
              variant="contained">
              {t('update')}
            </Button>
          </div>
        </Tooltip>
      </DialogActions>
    </Dialog>
  )
}
