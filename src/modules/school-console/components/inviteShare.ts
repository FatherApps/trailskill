import { t } from '../../../core/i18n';
import '../i18n';

// Where the app is downloaded, once there is a page for it. Empty on purpose: no address is written in the code, and the text leaves the link out while this is empty.
export const APP_DOWNLOAD_URL = '';

// What the admin hands to the coach by another channel. The invitation is accepted by signing in with the invited email, so it carries no token and no personal data beyond that email.
export function inviteShareText(school: string, email: string, link: string = APP_DOWNLOAD_URL): string {
  const text = t('schoolConsole.coaches.invite_sheet.share_text', { school, email });
  return link ? `${text} ${t('schoolConsole.coaches.invite_sheet.share_link', { link })}` : text;
}
