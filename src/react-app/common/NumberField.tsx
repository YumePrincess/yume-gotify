import { TextField, TextFieldProps } from '@mui/material'
import React from 'react'

import { useI18n } from '../i18n'

export interface NumberFieldProps {
  value: number
  onChange: (value: number) => void
}

export const NumberField = ({
  value,
  onChange,
  ...props
}: NumberFieldProps & Omit<TextFieldProps, 'value' | 'onChange'>) => {
  const { t } = useI18n()
  const [stringValue, setStringValue] = React.useState<string>(value.toString())
  const [error, setError] = React.useState('')

  return (
    <TextField
      value={stringValue}
      type="number"
      helperText={error}
      error={error !== ''}
      onChange={(event) => {
        setStringValue(event.target.value)
        const i = parseInt(event.target.value, 10)
        if (!Number.isNaN(i)) {
          onChange(i)
          setError('')
        } else {
          setError(t('invalidNumber'))
        }
      }}
      {...props}
    />
  )
}
