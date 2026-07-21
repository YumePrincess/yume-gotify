import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import React, { FC } from 'react'

interface IProps {
  title: string
  rightControl?: React.ReactNode
  maxWidth?: number
}

const DefaultPage: FC<React.PropsWithChildren<IProps>> = ({
  title,
  rightControl,
  maxWidth = 700,
  children
}) => (
  <section style={{ margin: '0 auto', maxWidth }} aria-labelledby="page-title">
    <Grid container spacing={4}>
      <Grid size={{ xs: 12 }} style={{ display: 'flex', flexWrap: 'wrap' }}>
        <Typography
          id="page-title"
          variant="h4"
          style={{ flex: 1, minWidth: 220 }}>
          {title}
        </Typography>
        {rightControl}
      </Grid>
      {children}
    </Grid>
  </section>
)
export default DefaultPage
