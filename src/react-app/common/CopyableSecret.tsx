import Copy from '@mui/icons-material/FileCopyOutlined'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import React, { CSSProperties } from 'react'

import { useStores } from '../stores'
import { useI18n } from '../i18n'

interface IProps {
  value: string
  style?: CSSProperties
  initialVisible?: boolean
}

const CopyableSecret = ({ value, style, initialVisible = false }: IProps) => {
  const [visible, setVisible] = React.useState(initialVisible)
  const text = visible ? value : '•••••••••••••••'
  const { snackManager } = useStores()
  const { t } = useI18n()
  const toggleVisibility = () => setVisible((b) => !b)
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(value)
      snackManager.snack(t('copiedToClipboard'))
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      snackManager.snack(t('copyFailed'))
    }
  }
  return (
    <div style={style}>
      <IconButton
        onClick={copyToClipboard}
        title={t('copyToClipboard')}
        aria-label={t('copyToClipboard')}
        size="large">
        <Copy />
      </IconButton>
      <IconButton
        onClick={toggleVisibility}
        className="toggle-visibility"
        title={visible ? t('hideSecret') : t('showSecret')}
        aria-label={visible ? t('hideSecret') : t('showSecret')}
        size="large">
        {visible ? <VisibilityOff /> : <Visibility />}
      </IconButton>
      <Typography style={{ fontFamily: 'monospace', fontSize: 16 }}>
        {text}
      </Typography>
    </div>
  )
}

export default CopyableSecret
