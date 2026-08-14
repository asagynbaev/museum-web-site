import crypto from 'node:crypto';

import { config } from './config.js';

/**
 * Клиент KICB Terminal API v1.7.
 *
 * Разделы доки: 2.1 — oauth2, 3.1 GetLink, 3.2 CheckStatus, 3.3 ChangeStatus,
 * 3.4 AbortPayment, 4.2 — шифрование terminalId при работе без VPN, 5 — коды.
 */

/** Статусы QR из раздела 3.3. */
export const QR_STATUS = {
  NOT_FOUND: 0,
  INITIALIZE: 1,
  SUCCESS: 2,
  FAILED: 3,
  IN_PROGRESS: 4,
};

/** Имена статусов для логов: «4» в логе ни о чём не говорит. */
export const QR_STATUS_NAME = {
  0: 'NotFound',
  1: 'Initialize',
  2: 'Success',
  3: 'Failed',
  4: 'InProgress',
};

/** Коды ответа из раздела 5. */
const CODE_MESSAGES = {
  0: 'Ok',
  1: 'BadRequest — некорректный запрос',
  2: 'DeviceNotFound — терминал не найден',
  3: 'AmountForDeviceNotFound — сумма для терминала не найдена',
  4: 'QrDataNotFound — QR с таким id не найден',
  5: 'InternalServiceError — внутренняя ошибка банка',
};

export class KicbError extends Error {
  constructor(message, { code = null, httpStatus = null } = {}) {
    super(message);
    this.name = 'KicbError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

class KicbClient {
  #token = null;
  #tokenExpiresAt = 0;
  #inflightToken = null;

  constructor(cfg) {
    this.cfg = cfg;
  }

  /**
   * terminalId вне IPSec-туннеля передаётся зашифрованным публичным ключом
   * терминала: RSA/OAEP-SHA256 → base64 (раздел 4.2). OAEP рандомизирован,
   * поэтому шифротекст каждый раз новый — это нормально, кэшировать нельзя.
   */
  #terminalId() {
    if (!this.cfg.terminalPublicKey) return this.cfg.terminalId;

    return crypto
      .publicEncrypt(
        {
          key: this.cfg.terminalPublicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(this.cfg.terminalId, 'utf8')
      )
      .toString('base64');
  }

  async #request(path, { method = 'GET', body, token, raw = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${this.cfg.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (cause) {
      // Таймаут или обрыв туннеля — сеть, а не отказ банка.
      throw new KicbError(`Банк недоступен: ${cause.message}`, { httpStatus: 504 });
    }

    const text = await res.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new KicbError(`Банк вернул не JSON (HTTP ${res.status}): ${text.slice(0, 200)}`, {
          httpStatus: res.status,
        });
      }
    }

    if (raw) return { res, payload };

    if (!res.ok) {
      const code = payload?.code ?? null;
      const detail = payload?.message || CODE_MESSAGES[code] || `HTTP ${res.status}`;
      throw new KicbError(detail, { code, httpStatus: res.status });
    }

    // Доку читаем буквально: code 0 — успех, любой другой — отказ,
    // даже если HTTP при этом 200.
    if (payload && payload.code !== undefined && payload.code !== 0) {
      throw new KicbError(payload.message || CODE_MESSAGES[payload.code] || 'Ошибка KICB', {
        code: payload.code,
        httpStatus: res.status,
      });
    }

    return payload;
  }

  /**
   * Токен живёт expiresIn секунд (обычно 3600). Обновляем за минуту до конца.
   * Параллельные запросы разделяют один инфлайт — иначе на старте улетит
   * пачка одинаковых логинов.
   */
  async #accessToken(force = false) {
    if (!force && this.#token && Date.now() < this.#tokenExpiresAt) return this.#token;
    if (this.#inflightToken) return this.#inflightToken;

    this.#inflightToken = (async () => {
      const data = await this.#request('/oauth2/token', {
        method: 'POST',
        body: { login: this.cfg.login, password: this.cfg.password },
      });

      if (!data?.accessToken) throw new KicbError('Банк не вернул accessToken');

      const ttl = Number(data.expiresIn) || 3600;
      this.#token = data.accessToken;
      this.#tokenExpiresAt = Date.now() + Math.max(ttl - 60, 30) * 1000;
      return this.#token;
    })();

    try {
      return await this.#inflightToken;
    } finally {
      this.#inflightToken = null;
    }
  }

  /** Выполняет вызов с токеном; на 401 один раз перелогинивается. */
  async #authed(path, options) {
    const token = await this.#accessToken();
    try {
      return await this.#request(path, { ...options, token });
    } catch (err) {
      if (err instanceof KicbError && err.httpStatus === 401) {
        const fresh = await this.#accessToken(true);
        return this.#request(path, { ...options, token: fresh });
      }
      throw err;
    }
  }

  /**
   * 3.1 GetLink — создаёт QR на сумму. amount в сомах (decimal 10,2).
   * amount = 0 означало бы «сумму вводит плательщик» — для билетов не годится.
   */
  async getLink({ id, amount }) {
    if (!(amount > 0)) throw new KicbError('amount должен быть больше нуля');

    const data = await this.#authed('/Terminal/Qr/GetLink', {
      method: 'POST',
      body: { id, terminalId: this.#terminalId(), amount },
    });

    const qrLink = data?.data?.qrLink;
    if (!qrLink) throw new KicbError('Банк не вернул qrLink');

    return {
      id: data.data.id ?? id,
      amount: data.data.amount ?? amount,
      currency: data.data.currency || 'KGS',
      qrLink,
    };
  }

  /** 3.2 CheckStatus — текущее состояние QR. */
  async checkStatus(id) {
    const data = await this.#authed(`/Terminal/Qr/CheckStatus?pQrId=${encodeURIComponent(id)}`);
    return {
      id: data?.data?.id ?? id,
      status: Number(data?.data?.status ?? QR_STATUS.NOT_FOUND),
      amount: data?.data?.amount ?? null,
      description: data?.data?.description ?? null,
    };
  }

  /** 3.3 ChangeStatus — принудительно выставить статус QR. */
  async changeStatus(id, status, message = 'ok') {
    return this.#authed('/Terminal/Qr/ChangeStatus', {
      method: 'POST',
      body: { id, status, message },
    });
  }

  /** 3.4 AbortPayment — отменить неоплаченный QR. */
  async abortPayment(id) {
    return this.#authed(`/Terminal/Qr/AbortPayment?pQrId=${encodeURIComponent(id)}`, {
      method: 'POST',
    });
  }
}

export const kicb = new KicbClient(config.kicb);
