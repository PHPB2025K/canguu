import { Users } from 'lucide-react';
import { useParams } from 'react-router-dom';

const CustomerDetail = () => {
  const { id } = useParams();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <Users className="h-24 w-24 text-muted-foreground/20 mb-4" />
      <h2 className="text-2xl font-semibold text-foreground">Cliente</h2>
      <p className="text-muted-foreground mt-1">Em construção... (ID: {id})</p>
    </div>
  );
};

export default CustomerDetail;
