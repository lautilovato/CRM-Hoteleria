/**
 * Helpers para los mensajes que se mandan con parse_mode 'HTML'.
 *
 * Telegram no convierte en link las URLs de localhost (no tienen dominio válido),
 * así que los links los armamos a mano con una etiqueta <a>.
 */

/** Escapa el texto que no controlamos (respuestas de la IA, nombres cargados en la DB). */
export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Arma un link clickeable. La URL se escapa aparte porque va dentro de un atributo. */
export const htmlLink = (url: string, label: string): string =>
  `<a href="${escapeHtml(encodeURI(url))}">${escapeHtml(label)}</a>`;
