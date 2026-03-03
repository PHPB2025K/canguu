import { useParams, useNavigate } from "react-router-dom";
import { ConversationChat } from "@/components/conversations/ConversationChat";
import { usePageTitle } from "@/hooks/usePageTitle";

const ConversationDetail = () => {
  usePageTitle("Conversa");
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      <ConversationChat
        conversationId={id || null}
        onBack={() => navigate("/conversations")}
        showBackButton
      />
    </div>
  );
};

export default ConversationDetail;
