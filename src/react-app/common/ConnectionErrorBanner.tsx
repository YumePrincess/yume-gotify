import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { useI18n } from '../i18n'

interface ConnectionErrorBannerProps {
  height: number
  retry: () => void
  message: string
}

export const ConnectionErrorBanner = ({
  height,
  retry,
  message
}: ConnectionErrorBannerProps) => {
  const { t } = useI18n()
  return (
    <div
      style={{
        backgroundColor: '#e74c3c',
        height,
        width: '100%',
        zIndex: 1300,
        position: 'relative'
      }}>
      <Typography
        align="center"
        variant="h6"
        style={{ lineHeight: `${height}px` }}>
        {message}{' '}
        <Button variant="outlined" onClick={retry}>
          {t('retry')}
        </Button>
      </Typography>
    </div>
  )
}
