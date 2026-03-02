import { AlertTriangle } from 'lucide-react';

const Escalations = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
    <AlertTriangle className="h-24 w-24 text-muted-foreground/20 mb-4" />
    <h2 className="text-2xl font-semibold text-foreground">Escalonamentos</h2>
    <p className="text-muted-foreground mt-1">Em construção...</p>
  </div>
);

export default Escalations;
