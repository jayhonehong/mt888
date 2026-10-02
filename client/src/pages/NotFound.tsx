import { Link } from 'react-router-dom';
import { EmptyState, Icon, Panel } from '../components/ui';

export function NotFound() {
  return (
    <Panel>
      <EmptyState
        icon={<Icon name="info" className="h-7 w-7" />}
        title="Off the board"
        body="That page does not exist. The live board is a good place to restart."
        action={
          <Link to="/" className="btn btn-primary">
            Back to the live board
          </Link>
        }
      />
    </Panel>
  );
}
