import type { IECard } from '../../types';

export const ECardParser = {
  parse(json: any): IECard | null {
    if (!json) throw new Error('SESSION_EXPIRED');
    if (json.code !== '0' && json.code !== 0) {
      // Portal auth failure indicators
      if (json.code === 401 || json.code === 403 || json.code === -1) {
        throw new Error('SESSION_EXPIRED');
      }
      return null;
    }
    const data = json.data || {};
    const balanceStr = data.cardWallet || data.wallet || data.balance || data.card_wallet || '0';
    return {
      balance: parseFloat(balanceStr.toString()),
      status: data.cardStatus || data.status || '未知',
      lastTime: data.dbTime || data.time || ''
    };
  }
};
