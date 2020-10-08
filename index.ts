import * as puppeteer from 'puppeteer';
import * as dayjs from 'dayjs';
import axios from 'axios';

// Incomming WebhookのURLを入力
const WEBHOOK_URL = 'XXXXXXXXXXXXXXXXXXXXXXXXXX';
const YEAR = 2020;
const MONTH = 10;
const DATE = 25;
const PARK = 'tdl'; // tdl（東京ディズニーランド） or tds（東京ディズニーシー）
const PASSPORT = '1デーパスポート'; // チケット名をハードコードする以外に識別できる値が存在しなかった…

const URL = `https://www.tokyodisneyresort.jp/ticket/sales_status/${YEAR}${MONTH}`;

async function watching(page: puppeteer.Page, browser: puppeteer.Browser) {
  await page.waitForSelector('.ticketStock');

  // 行きたい日付と行きたい場所の属性を持っている要素をクリック
  await page.click(`a[data-park="${PARK}"][data-ymd="${YEAR}${MONTH}${DATE}"]`);

  // 欲しいチケットが存在するかを確認
  await page.waitForSelector('.modalContent');

  const result = await page.evaluate(
    (PARK, PASSPORT) => {
      const elements = document.querySelectorAll(`.table.${PARK} tbody tr`);
      const target = Array.prototype.find.call(
        elements,
        (element) => element?.children[0].innerText === PASSPORT
      );

      return target?.children[1].getAttribute('class');
    },
    PARK,
    PASSPORT
  );
  const date = dayjs().format('YYYY-MM-DD HH:mm:ss');

  // 欲しいチケットがあったらSlack通知
  switch (result) {
    // 売り切れ（すべてのチケットが存在しない場合はundefined）
    case undefined:
    case 'is-none': {
      console.log(`[${date}] 売り切れ…😫`);

      // 1分後に再チェック
      setTimeout(async () => {
        await page.reload();
        await watching(page, browser);
      }, 1000 * 60 * 1);
      break;
    }

    // 残りわずか
    case 'is-few':
    // 販売中（classは空文字）
    case '': {
      console.log(`[${date}] 買えるぞ！😳`);

      await axios
        .post(WEBHOOK_URL, {
          text: `${YEAR}年${MONTH}月${DATE}日の${PASSPORT}が買えるぞ！`,
        })
        .catch((err) => {
          console.error(err);
        });

      await browser.close();
      break;
    }
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--window-size=1600,1000', '--no-sandbox'],
  });
  const page = await browser.newPage();

  await page.setViewport({
    width: 1600,
    height: 1000,
  });

  // チケット在庫確認ページを開く
  await page.goto(URL);

  await watching(page, browser);
})();
