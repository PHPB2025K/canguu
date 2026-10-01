import { describe, expect, it } from "vitest";
import { customerCaption, downloadHref, getAttachments, getNotice, viewerMode } from "./attachments";

const base = { sender: "customer", original_audio_url: null, content: "" };
const ST = "https://x.supabase.co/storage/v1/object/public/chat-attachments";

describe("getAttachments", () => {
  it("lê as chaves por tipo do WhatsApp", () => {
    const [img] = getAttachments({ ...base, message_type: "image", metadata: { image_url: `${ST}/image/c/1.jpg` } });
    expect(img).toMatchObject({ kind: "image", missing: false });
    const [doc] = getAttachments({
      ...base,
      message_type: "document",
      metadata: { document_url: `${ST}/document/c/2.pdf`, document_filename: "nota.pdf", document_mimetype: "application/pdf", document_size: 2048 },
    });
    expect(doc).toMatchObject({ kind: "document", filename: "nota.pdf", size: 2048 });
    expect(viewerMode(doc)).toBe("pdf");
    const [stk] = getAttachments({ ...base, message_type: "sticker", metadata: { sticker_url: `${ST}/sticker/c/3.webp`, sticker_animated: true } });
    expect(stk).toMatchObject({ kind: "sticker", animated: true });
    expect(viewerMode(stk)).toBe("image");
  });

  it("marca como indisponível a mídia antiga sem arquivo", () => {
    const [doc] = getAttachments({ ...base, message_type: "document", metadata: null });
    expect(doc).toMatchObject({ kind: "document", missing: true });
    const [stk] = getAttachments({ ...base, message_type: "sticker", metadata: { original_type: "sticker" } });
    expect(stk).toMatchObject({ kind: "sticker", missing: true });
    const [share] = getAttachments({ ...base, message_type: "template", metadata: null });
    expect(share).toMatchObject({ kind: "link", missing: true, title: "Conteúdo compartilhado" });
  });

  it("não trata o modelo de mensagem da Ana como anexo", () => {
    expect(getAttachments({ ...base, sender: "agent", message_type: "template", metadata: { template: "atendimento_abertura" } })).toEqual([]);
    expect(getAttachments({ ...base, message_type: "text", metadata: null })).toEqual([]);
    expect(getAttachments({ ...base, message_type: "interactive", metadata: null })).toEqual([]);
  });

  it("lê localização e contato", () => {
    const [loc] = getAttachments({ ...base, message_type: "location", metadata: { location: { latitude: -23.5, longitude: -46.6, name: "Loja" } } });
    expect(loc.location).toMatchObject({ latitude: -23.5, longitude: -46.6, name: "Loja" });
    const [ct] = getAttachments({
      ...base,
      message_type: "contacts",
      metadata: { contacts: [{ name: { formatted_name: "Ana Souza" }, phones: [{ phone: "+55 11 99999-0000" }], emails: [{ email: "a@b.com" }] }] },
    });
    expect(ct.contacts[0]).toMatchObject({ name: "Ana Souza", phones: ["+55 11 99999-0000"], emails: ["a@b.com"] });
  });

  it("junta a lista do Instagram sem repetir o 1º anexo", () => {
    const url = `${ST}/image/c/ig1.jpg`;
    const atts = getAttachments({
      ...base,
      message_type: "image",
      metadata: {
        image_url: url,
        attachments: [
          { kind: "image", url, mime: "image/jpeg" },
          { kind: "image", url: `${ST}/image/c/ig2.jpg`, mime: "image/jpeg" },
          { kind: "link", link: "https://instagram.com/p/x", title: "Publicação compartilhada" },
        ],
      },
    });
    expect(atts.map((a) => a.kind)).toEqual(["image", "image", "link"]);
    expect(atts[2].missing).toBe(false);
  });
});

describe("viewerMode", () => {
  const doc = (mime: string | null, filename: string | null) => ({
    ...getAttachments({ ...base, message_type: "document", metadata: { document_url: `${ST}/document/c/x`, document_mimetype: mime, document_filename: filename } })[0],
  });
  it("escolhe o visualizador pelo tipo do arquivo", () => {
    expect(viewerMode(doc("image/png", "foto.png"))).toBe("image");
    expect(viewerMode(doc("text/xml", "nfe.xml"))).toBe("text");
    expect(viewerMode(doc(null, "planilha.csv"))).toBe("text");
    expect(viewerMode(doc("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "contrato.docx"))).toBe("file");
    expect(viewerMode(doc("image/heic", "IMG_1.HEIC"))).toBe("file");
  });
});

describe("getNotice", () => {
  it("explica o unsupported e a reação", () => {
    expect(getNotice({ ...base, message_type: "unsupported", metadata: null })).toEqual({ kind: "unsupported", label: null, detail: null });
    expect(getNotice({ ...base, message_type: "unsupported", metadata: { unsupported: { type: "poll_creation" } } })).toMatchObject({ label: "enquete" });
    expect(getNotice({ ...base, message_type: "reaction", content: "[reaction: 👍]", metadata: null })).toEqual({ kind: "reaction", emoji: "👍" });
    expect(getNotice({ ...base, message_type: "reaction", content: "[reaction — formato que voce nao consegue ler.]", metadata: null })).toEqual({ kind: "reaction", emoji: null });
    expect(getNotice({ ...base, message_type: "text", metadata: null })).toBeNull();
  });
});

describe("customerCaption", () => {
  it("mostra só o que o cliente escreveu", () => {
    expect(customerCaption({ metadata: null, content: "olha o defeito\n[Foto enviada pelo cliente] Pote de vidro com trinca." })).toBe("olha o defeito");
    expect(customerCaption({ metadata: null, content: "[O cliente enviou um DOCUMENTO/PDF. Voce NAO consegue abrir. Peca o numero do pedido ou uma foto.]" })).toBe("");
    expect(customerCaption({ metadata: null, content: "achei lindo\n[O cliente respondeu/compartilhou um conteudo do Instagram]" })).toBe("achei lindo");
    expect(customerCaption({ metadata: { caption: "segue a nota" }, content: "[O cliente enviou um DOCUMENTO]" })).toBe("segue a nota");
  });
});

describe("downloadHref", () => {
  it("força o download só no Storage", () => {
    expect(downloadHref(`${ST}/document/c/2.pdf`, "nota fiscal.pdf")).toBe(`${ST}/document/c/2.pdf?download=nota%20fiscal.pdf`);
    expect(downloadHref("https://cdn.exemplo.com/a.pdf", "a.pdf")).toBe("https://cdn.exemplo.com/a.pdf");
  });
});

describe("motivo do arquivo não guardado", () => {
  it("traduz o upload_error do webhook", () => {
    const [big] = getAttachments({ ...base, message_type: "document", metadata: { document_filename: "catalogo.pdf", upload_error: "arquivo maior que 25 MB" } });
    expect(big).toMatchObject({ missing: true, filename: "catalogo.pdf", reason: "too_big" });
    const [tipo] = getAttachments({ ...base, message_type: "document", metadata: { upload_error: 'Error: storage 400 {"statusCode":"415","error":"invalid_mime_type","message":"mime type text/html is not supported"}' } });
    expect(tipo.reason).toBe("type_not_kept");
    const [ig] = getAttachments({ ...base, message_type: "video", metadata: { attachments: [{ kind: "video", url: null, upload_error: "arquivo maior que 25 MB" }] } });
    expect(ig).toMatchObject({ kind: "video", missing: true, reason: "too_big" });
  });
});

describe("conteúdo compartilhado do Instagram", () => {
  it("guarda legenda e link do card", () => {
    const [card] = getAttachments({
      ...base,
      message_type: "template",
      metadata: { attachments: [{ kind: "image", url: `${ST}/image/c/m4.jpg`, title: "Conteúdo compartilhado", caption: "Kit 5 potes", link: "https://budamix.com.br/produto/kit" }] },
    });
    expect(card).toMatchObject({ kind: "image", title: "Conteúdo compartilhado", note: "Kit 5 potes", link: "https://budamix.com.br/produto/kit", missing: false });
  });
});
