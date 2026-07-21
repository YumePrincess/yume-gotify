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
  appName: string
  defaultPriority: number
  fClose: VoidFunction
  fOnSubmit: (message: string, title: string, priority: number) => Promise<void>
}

export const PushMessageDialog = ({
  appName,
  defaultPriority,
  fClose,
  fOnSubmit
}: IProps) => {
  const { t } = useI18n()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState(defaultPriority)

  const submitEnabled = message.trim().length !== 0
  const submitAndClose = async () => {
    await fOnSubmit(message, title, priority)
    fClose()
  }

  return (
    <Dialog
      open={true}
      onClose={fClose}
      aria-labelledby="push-message-title"
      id="push-message-dialog">
      <DialogTitle id="push-message-title">{t('pushMessageTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t('pushMessageHelp', { name: appName })}
        </DialogContentText>
        <TextField
          margin="dense"
          className="title"
          label={t('title')}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          fullWidth
        />
        <TextField
          autoFocus
          margin="dense"
          className="message"
          label={t('messageRequired')}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          fullWidth
          multiline
          minRows={4}
        />
        <NumberField
          margin="dense"
          className="priority"
          label={t('priority')}
          value={priority}
          onChange={(value) => setPriority(value)}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={fClose}>{t('cancel')}</Button>
        <Tooltip title={submitEnabled ? '' : t('messageRequiredHint')}>
          <div>
            <Button
              className="send"
              disabled={!submitEnabled}
              onClick={submitAndClose}
              color="primary"
              variant="contained">
              {t('send')}
            </Button>
          </div>
        </Tooltip>
      </DialogActions>
    </Dialog>
  )
}
