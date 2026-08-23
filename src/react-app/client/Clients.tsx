import Delete from '@mui/icons-material/Delete'
import Edit from '@mui/icons-material/Edit'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'

import ConfirmDialog from '../common/ConfirmDialog'
import CopyableSecret from '../common/CopyableSecret'
import DefaultPage from '../common/DefaultPage'
import { LastUsedCell } from '../common/LastUsedCell'
import { useStores } from '../stores'
import { useI18n } from '../i18n'
import { IClient } from '../types'
import AddClientDialog from './AddClientDialog'
import UpdateClientDialog from './UpdateClientDialog'

const Clients = observer(() => {
  const { t } = useI18n()
  const { clientStore } = useStores()
  const [toDeleteClient, setToDeleteClient] = useState<IClient>()
  const [toUpdateClient, setToUpdateClient] = useState<IClient>()
  const [createDialog, setCreateDialog] = useState<boolean>(false)
  const clients = clientStore.getItems()

  useEffect(() => void clientStore.refresh(), [])

  return (
    <DefaultPage
      title={t('clients')}
      rightControl={
        <Button
          id="create-client"
          variant="contained"
          color="primary"
          onClick={() => setCreateDialog(true)}>
          {t('createClient')}
        </Button>
      }>
      <Grid size={12}>
        <Paper elevation={6} style={{ overflowX: 'auto' }}>
          <Table id="client-table">
            <TableHead>
              <TableRow style={{ textAlign: 'center' }}>
                <TableCell>{t('name')}</TableCell>
                <TableCell style={{ width: 200 }}>{t('token')}</TableCell>
                <TableCell>{t('lastUsed')}</TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {clients.map((client: IClient) => (
                <Row
                  key={client.id}
                  name={client.name}
                  value={client.token ?? ''}
                  lastUsed={client.lastUsed}
                  fEdit={() => setToUpdateClient(client)}
                  fDelete={() => setToDeleteClient(client)}
                />
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Grid>
      {createDialog && (
        <AddClientDialog
          fClose={() => setCreateDialog(false)}
          fOnSubmit={clientStore.create}
        />
      )}
      {toUpdateClient != null && (
        <UpdateClientDialog
          fClose={() => setToUpdateClient(undefined)}
          fOnSubmit={(name) => clientStore.update(toUpdateClient.id, name)}
          initialName={toUpdateClient.name}
        />
      )}
      {toDeleteClient != null && (
        <ConfirmDialog
          title={t('confirmDelete')}
          text={t('deleteNamed', { name: toDeleteClient.name })}
          fClose={() => setToDeleteClient(undefined)}
          fOnSubmit={() => clientStore.remove(toDeleteClient.id)}
        />
      )}
    </DefaultPage>
  )
})

interface IRowProps {
  name: string
  value: string
  lastUsed: string | null
  fEdit: VoidFunction
  fDelete: VoidFunction
}

const Row = ({ name, value, lastUsed, fEdit, fDelete }: IRowProps) => {
  const { t } = useI18n()
  return (
    <TableRow>
      <TableCell>{name}</TableCell>
      <TableCell>
        <CopyableSecret
          value={value}
          style={{ display: 'flex', alignItems: 'center', width: 250 }}
        />
      </TableCell>
      <TableCell>
        <LastUsedCell lastUsed={lastUsed} />
      </TableCell>
      <TableCell align="right" padding="none">
        <IconButton
          onClick={fEdit}
          className="edit"
          title={t('edit')}
          aria-label={t('edit')}>
          <Edit />
        </IconButton>
      </TableCell>
      <TableCell align="right" padding="none">
        <IconButton
          onClick={fDelete}
          className="delete"
          title={t('delete')}
          aria-label={t('delete')}>
          <Delete />
        </IconButton>
      </TableCell>
    </TableRow>
  )
}

export default Clients
