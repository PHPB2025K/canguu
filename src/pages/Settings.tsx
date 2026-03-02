import { Settings as SettingsIcon } from 'lucide-react';

const Settings = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
    <SettingsIcon className="h-24 w-24 text-muted-foreground/20 mb-4" />
    <h2 className="text-2xl font-semibold text-foreground">Configurações</h2>
    <p className="text-muted-foreground mt-1">Em construção...</p>
  </div>
);

export default Settings;
