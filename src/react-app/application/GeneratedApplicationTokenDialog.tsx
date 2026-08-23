import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

import CopyableSecret from '../common/CopyableSecret'
import { useI18n } from '../i18n'

interface IProps {
  appName: string
  token: string
  fClose: VoidFunction
}

export const GeneratedApplicationTokenDialog = ({
  appName,
  token,
  fClose
}: IProps) => {
  const { t } = useI18n()

  return (
    <Dialog
      open={true}
      onClose={fClose}
      aria-labelledby="generated-application-token-title"
      maxWidth="sm"
      fullWidth>
      <DialogTitle id="generated-application-token-title">
        {t('newApplicationTokenTitle')}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t('newApplicationTokenHelp', { name: appName })}
        </DialogContentText>
        <CopyableSecret
          value={token}
          initialVisible={true}
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: 16,
            minWidth: 0
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={fClose} color="primary" variant="contained">
          {t('done')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
