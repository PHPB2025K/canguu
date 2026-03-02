import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConversationList } from "@/components/conversations/ConversationList";
import { ConversationChat } from "@/components/conversations/ConversationChat";

const Conversations = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSelect = (id: string) => {
    // On mobile (<lg), navigate to detail route
    if (window.innerWidth < 1024) {
      navigate(`/conversations/${id}`);
    } else {
      setSelectedId(id);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      {/* Left panel - always visible on desktop, always visible on mobile */}
      <div className="w-full lg:w-96 lg:border-r border-border flex flex-col">
        <ConversationList selectedId={selectedId} onSelect={handleSelect} />
      </div>

      {/* Right panel - hidden on mobile */}
      <div className="hidden lg:flex flex-1 flex-col">
        <ConversationChat conversationId={selectedId} />
      </div>
    </div>
  );
};

export default Conversations;
