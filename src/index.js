const PAGE_URL =
  "https://topic17z2k407.jin10.com/topic/jin10_important_news.html?from=web_homepage";

const PAGE_ORIGIN =
  "https://topic17z2k407.jin10.com";

const PAGE_REFERER =
  "https://topic17z2k407.jin10.com/";

const USERINFO_URL =
  "https://uc-api.jin10.com/userinfo?forceUpdate=true";

const API_PATH =
  "/top/flashsByTime?time_type=time&sort=priority";

const FALLBACK_API_HOST =
  "1b8d6028d99849668a6d8755c79e650f.z3c.jin10.com";

const X_APP_ID =
  "EzF2s2HxxU0U5bYa";

const X_VERSION =
  "1.0.0";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/151.0.0.0 Safari/537.36";


const KV_RSS_KEY =
  "jin10-important-rss";

const KV_UPDATED_KEY =
  "jin10-important-updated-at";

const KV_COUNT_KEY =
  "jin10-important-item-count";


export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);


    /*
     * 根目录
     *
     * 不访问金十
     * 不读取 RSS
     */
    if (url.pathname === "/") {
      return new Response(
        [
          "Jin10 RSS Worker is running.",
          "",
          "RSS:",
          `${url.origin}/jin10-important`,
          "",
          "Status:",
          `${url.origin}/status`,
          "",
          "Manual refresh:",
          `${url.origin}/refresh`,
        ].join("\n"),
        {
          headers: {
            "content-type":
              "text/plain; charset=utf-8",
          },
        }
      );
    }


    /*
     * RSS
     *
     * 非常重要：
     *
     * 这里只允许读取 KV。
     *
     * 绝对不：
     * - fetch 金十
     * - 初始化 Cookie
     * - 查找 API Host
     * - 调用 refresh
     */
    if (
      url.pathname ===
      "/jin10-important"
    ) {
      return serveRSSFromKV(
        env
      );
    }


    /*
     * 状态页面
     *
     * 也只读取 KV。
     */
    if (
      url.pathname ===
      "/status"
    ) {
      return serveStatus(
        env
      );
    }


    /*
     * 手动刷新
     *
     * 只有这里才访问金十。
     */
    if (
      url.pathname ===
      "/refresh"
    ) {
      try {
        const result =
          await refreshRSS(
            env
          );

        return new Response(
          [
            "Refresh OK",
            `Items: ${result.itemCount}`,
            `Updated: ${result.updatedAt}`,
          ].join("\n"),
          {
            headers: {
              "content-type":
                "text/plain; charset=utf-8",

              "cache-control":
                "no-store",
            },
          }
        );

      } catch (error) {
        return new Response(
          [
            "Refresh failed",
            "",
            String(
              error?.stack ||
              error
            ),
          ].join("\n"),
          {
            status: 500,

            headers: {
              "content-type":
                "text/plain; charset=utf-8",

              "cache-control":
                "no-store",
            },
          }
        );
      }
    }


    return new Response(
      "Not Found",
      {
        status: 404,
      }
    );
  },


  /*
   * Cloudflare Cron
   *
   * 每 30 分钟执行。
   *
   * 抓取成功：
   *   覆盖 KV
   *
   * 抓取失败：
   *   原来的 RSS 保持不变
   */
  async scheduled(
    controller,
    env,
    ctx
  ) {
    ctx.waitUntil(
      refreshRSS(
        env
      )
        .then(
          (result) => {
            console.log(
              "Scheduled refresh OK:",
              result
            );
          }
        )
        .catch(
          (error) => {
            console.error(
              "Scheduled refresh failed:",
              error
            );
          }
        )
    );
  },
};


/*
 * =========================================================
 * RSS 请求
 * =========================================================
 *
 * 这里只进行一次 KV GET。
 *
 * 不允许访问任何外部网站。
 */
async function serveRSSFromKV(
  env
) {
  if (
    !env.RSS_CACHE
  ) {
    return new Response(
      "RSS_CACHE binding is missing.",
      {
        status: 500,

        headers: {
          "content-type":
            "text/plain; charset=utf-8",

          "cache-control":
            "no-store",
        },
      }
    );
  }


  const rss =
    await env.RSS_CACHE.get(
      KV_RSS_KEY
    );


  if (!rss) {
    return new Response(
      [
        "RSS cache is empty.",
        "",
        "Open /refresh once first.",
      ].join("\n"),
      {
        status: 503,

        headers: {
          "content-type":
            "text/plain; charset=utf-8",

          "cache-control":
            "no-store",
        },
      }
    );
  }


  return new Response(
    rss,
    {
      status: 200,

      headers: {
        "content-type":
          "application/rss+xml; charset=utf-8",

        /*
         * FreshRSS 可以直接取。
         *
         * Cloudflare 边缘节点也允许短时间缓存。
         */
        "cache-control":
          "public, max-age=60",

        "x-rss-source":
          "cloudflare-kv",
      },
    }
  );
}


/*
 * =========================================================
 * 状态
 * =========================================================
 *
 * 同样只读取 KV。
 */
async function serveStatus(
  env
) {
  if (
    !env.RSS_CACHE
  ) {
    return new Response(
      "RSS_CACHE binding is missing.",
      {
        status: 500,

        headers: {
          "content-type":
            "text/plain; charset=utf-8",
        },
      }
    );
  }


  const [
    updatedAt,
    itemCount,
  ] =
    await Promise.all([
      env.RSS_CACHE.get(
        KV_UPDATED_KEY
      ),

      env.RSS_CACHE.get(
        KV_COUNT_KEY
      ),
    ]);


  return new Response(
    [
      "Jin10 RSS cache status",
      "",
      `Updated: ${updatedAt || "never"}`,
      `Items: ${itemCount || "0"}`,
    ].join("\n"),
    {
      headers: {
        "content-type":
          "text/plain; charset=utf-8",

        "cache-control":
          "no-store",
      },
    }
  );
}


/*
 * =========================================================
 * 刷新
 * =========================================================
 *
 * 这里才真正访问金十。
 */
async function refreshRSS(
  env
) {
  if (
    !env.RSS_CACHE
  ) {
    throw new Error(
      "RSS_CACHE binding is missing"
    );
  }


  /*
   * 先完整抓取。
   *
   * 抓取失败时不会写 KV，
   * 因此旧 RSS 会继续保留。
   */
  const items =
    await fetchJin10Items();


  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    throw new Error(
      "Jin10 returned no items"
    );
  }


  const rss =
    generateRSS(
      items
    );


  const updatedAt =
    new Date().toISOString();


  /*
   * RSS 最后写。
   *
   * 即使前面的网络请求失败，
   * 旧 RSS 也不会被清空。
   */
  await env.RSS_CACHE.put(
    KV_RSS_KEY,
    rss
  );


  await Promise.all([
    env.RSS_CACHE.put(
      KV_UPDATED_KEY,
      updatedAt
    ),

    env.RSS_CACHE.put(
      KV_COUNT_KEY,
      String(
        items.length
      )
    ),
  ]);


  return {
    itemCount:
      items.length,

    updatedAt,
  };
}


/*
 * =========================================================
 * 金十抓取
 * =========================================================
 */
async function fetchJin10Items() {
  const cookieJar = [];


  /*
   * 1.
   * 打开重要事件页面。
   */
  const pageResponse =
    await fetch(
      PAGE_URL,
      {
        headers: {
          "User-Agent":
            USER_AGENT,

          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

          "Accept-Language":
            "zh-CN,zh;q=0.9,en;q=0.8",
        },
      }
    );


  if (
    !pageResponse.ok
  ) {
    throw new Error(
      `Page HTTP ${pageResponse.status}`
    );
  }


  collectCookies(
    pageResponse,
    cookieJar
  );


  const pageHTML =
    await pageResponse.text();


  /*
   * 2.
   * 请求 userinfo。
   *
   * 金十会在这里建立会话 / Cookie。
   */
  const userInfoResponse =
    await fetch(
      USERINFO_URL,
      {
        headers:
          buildAPIHeaders(
            cookieJar
          ),
      }
    );


  collectCookies(
    userInfoResponse,
    cookieJar
  );


  console.log(
    "Userinfo:",
    userInfoResponse.status
  );


  /*
   * 3.
   * 从页面 JS 中寻找当前 API Host。
   */
  const hosts =
    await discoverAPIHosts(
      pageHTML
    );


  /*
   * 加入备用地址。
   */
  if (
    !hosts.includes(
      FALLBACK_API_HOST
    )
  ) {
    hosts.push(
      FALLBACK_API_HOST
    );
  }


  if (
    hosts.length === 0
  ) {
    throw new Error(
      "No Jin10 API host found"
    );
  }


  let lastError =
    null;


  /*
   * 4.
   * 挨个尝试 API Host。
   */
  for (
    const host
    of hosts
  ) {
    const apiURL =
      `https://${host}${API_PATH}`;


    try {
      console.log(
        "Trying API:",
        apiURL
      );


      const response =
        await fetch(
          apiURL,
          {
            headers:
              buildAPIHeaders(
                cookieJar
              ),
          }
        );


      console.log(
        "API HTTP:",
        response.status
      );


      if (
        !response.ok
      ) {
        lastError =
          new Error(
            `API HTTP ${response.status}`
          );

        continue;
      }


      const payload =
        await response.json();


      if (
        payload?.status !== 200
      ) {
        lastError =
          new Error(
            `API status ${payload?.status}`
          );

        continue;
      }


      if (
        !Array.isArray(
          payload?.data
        )
      ) {
        lastError =
          new Error(
            "Invalid API data"
          );

        continue;
      }


      if (
        payload.data.length === 0
      ) {
        lastError =
          new Error(
            "API returned zero items"
          );

        continue;
      }


      console.log(
        "API OK:",
        payload.data.length,
        "items"
      );


      return payload.data;

    } catch (error) {
      lastError =
        error;


      console.error(
        "API failed:",
        host,
        error
      );
    }
  }


  throw (
    lastError ||
    new Error(
      "All Jin10 API hosts failed"
    )
  );
}


/*
 * =========================================================
 * 请求头
 * =========================================================
 */
function buildAPIHeaders(
  cookieJar
) {
  const headers = {
    "Accept":
      "*/*",

    "Accept-Language":
      "zh-CN,zh;q=0.9,en;q=0.8",

    "Content-Type":
      "application/json",

    "Origin":
      PAGE_ORIGIN,

    "Referer":
      PAGE_REFERER,

    "User-Agent":
      USER_AGENT,

    "x-app-id":
      X_APP_ID,

    "x-version":
      X_VERSION,
  };


  if (
    cookieJar.length > 0
  ) {
    headers.Cookie =
      cookieJar.join(
        "; "
      );
  }


  return headers;
}


/*
 * =========================================================
 * Cookie
 * =========================================================
 */
function collectCookies(
  response,
  cookieJar
) {
  let values = [];


  /*
   * Cloudflare Workers 支持 getSetCookie() 时优先使用。
   */
  if (
    typeof response.headers.getSetCookie ===
    "function"
  ) {
    values =
      response.headers.getSetCookie();
  }


  /*
   * 兼容普通 get("set-cookie")。
   */
  if (
    values.length === 0
  ) {
    const raw =
      response.headers.get(
        "set-cookie"
      );


    if (raw) {
      values =
        raw.split(
          /,(?=[^;,]+=)/
        );
    }
  }


  for (
    const rawCookie
    of values
  ) {
    const cookie =
      String(rawCookie)
        .split(";")[0]
        .trim();


    if (!cookie) {
      continue;
    }


    const eq =
      cookie.indexOf("=");


    if (
      eq <= 0
    ) {
      continue;
    }


    const name =
      cookie.slice(
        0,
        eq
      );


    const oldIndex =
      cookieJar.findIndex(
        (item) =>
          item.startsWith(
            `${name}=`
          )
      );


    if (
      oldIndex >= 0
    ) {
      cookieJar[
        oldIndex
      ] = cookie;

    } else {
      cookieJar.push(
        cookie
      );
    }
  }
}


/*
 * =========================================================
 * API Host 自动发现
 * =========================================================
 */
async function discoverAPIHosts(
  pageHTML
) {
  const hosts =
    new Set();


  addHosts(
    pageHTML,
    hosts
  );


  const scriptRegex =
    /<script[^>]+src=["']([^"']+)["']/gi;


  const scripts = [];

  let match;


  while (
    (
      match =
        scriptRegex.exec(
          pageHTML
        )
    ) !== null
  ) {
    scripts.push(
      match[1]
    );
  }


  /*
   * 防止页面以后引用很多 JS，
   * 最多检查前 15 个。
   */
  for (
    const src
    of scripts.slice(
      0,
      15
    )
  ) {
    try {
      const jsURL =
        new URL(
          src,
          PAGE_URL
        ).href;


      const response =
        await fetch(
          jsURL,
          {
            headers: {
              "User-Agent":
                USER_AGENT,

              "Referer":
                PAGE_URL,
            },
          }
        );


      if (
        !response.ok
      ) {
        continue;
      }


      const text =
        await response.text();


      addHosts(
        text,
        hosts
      );

    } catch {
      /*
       * 某个 JS 失败不影响其他 JS。
       */
    }
  }


  return [
    ...hosts,
  ];
}


function addHosts(
  text,
  hosts
) {
  const regex =
    /([a-zA-Z0-9]+\.z3c\.jin10\.com)/g;


  let match;


  while (
    (
      match =
        regex.exec(
          String(
            text || ""
          )
        )
    ) !== null
  ) {
    hosts.add(
      match[1]
    );
  }
}


/*
 * =========================================================
 * RSS
 * =========================================================
 */
function generateRSS(
  items
) {
  const rssItems = [];


  for (
    const wrapper
    of items
  ) {
    if (
      !wrapper ||
      typeof wrapper !==
        "object"
    ) {
      continue;
    }


    const itemId =
      String(
        wrapper.item_id ||
        ""
      ).trim();


    const outer =
      wrapper.data || {};


    const inner =
      outer.data || {};


    const content =
      String(
        inner.content ||
        ""
      ).trim();


    const title =
      extractTitle(
        inner,
        content
      );


    if (!title) {
      continue;
    }


    const link =
      chooseLink(
        itemId,
        inner
      );


    const pubDate =
      parsePubDate(
        outer.time
      );


    const description =
      buildDescription(
        inner,
        outer
      );


    rssItems.push(
`<item>
<title>${escapeXML(title)}</title>
<link>${escapeXML(link)}</link>
<guid isPermaLink="false">${escapeXML(itemId || link)}</guid>
<pubDate>${escapeXML(pubDate)}</pubDate>
<description><![CDATA[${description}]]></description>
</item>`
    );
  }


  if (
    rssItems.length === 0
  ) {
    throw new Error(
      "No valid RSS items generated"
    );
  }


  return (
`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>金十数据 - 重要事件</title>
<link>${escapeXML(PAGE_URL)}</link>
<description>金十数据重要事件 RSS</description>
<language>zh-cn</language>
<generator>Cloudflare Worker KV Cache</generator>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems.join("\n")}
</channel>
</rss>`
  );
}


/*
 * =========================================================
 * 标题
 * =========================================================
 */
function extractTitle(
  inner,
  content
) {
  const title =
    String(
      inner?.title ||
      ""
    ).trim();


  if (title) {
    return title;
  }


  const match =
    content.match(
      /^【([^】]+)】/
    );


  if (match) {
    return (
      match[1].trim()
    );
  }


  const clean =
    content
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  if (
    clean.length > 60
  ) {
    return (
      clean.slice(
        0,
        60
      ) +
      "…"
    );
  }


  return (
    clean ||
    "金十重要事件"
  );
}


/*
 * =========================================================
 * 链接
 * =========================================================
 */
function chooseLink(
  itemId,
  inner
) {
  const link =
    String(
      inner?.link ||
      ""
    ).trim();


  if (link) {
    return link;
  }


  const sourceLink =
    String(
      inner?.source_link ||
      ""
    ).trim();


  if (
    sourceLink
  ) {
    return sourceLink;
  }


  return (
    "https://flash.jin10.com/detail/" +
    itemId
  );
}


/*
 * =========================================================
 * 正文
 * =========================================================
 */
function buildDescription(
  inner,
  outer
) {
  const parts = [];


  const pic =
    String(
      inner?.pic ||
      ""
    ).trim();


  if (pic) {
    parts.push(
      `<p><img src="${escapeHTML(pic)}" style="max-width:100%;height:auto;" /></p>`
    );
  }


  const content =
    String(
      inner?.content ||
      ""
    ).trim();


  if (content) {
    parts.push(
      `<p>${escapeHTML(content)}</p>`
    );
  }


  const source =
    String(
      inner?.source ||
      ""
    ).trim();


  if (source) {
    parts.push(
      `<p>来源：${escapeHTML(source)}</p>`
    );
  }


  const tag =
    String(
      inner?.tag ||
      ""
    ).trim();


  if (tag) {
    parts.push(
      `<p>分类：${escapeHTML(tag)}</p>`
    );
  }


  const remarks =
    Array.isArray(
      outer?.remark
    )
      ? outer.remark
      : [];


  const remarkItems = [];


  for (
    const remark
    of remarks
  ) {
    if (
      !remark ||
      typeof remark !==
        "object"
    ) {
      continue;
    }


    const title =
      String(
        remark.title ||
        ""
      ).trim();


    const remarkContent =
      String(
        remark.content ||
        ""
      ).trim();


    const remarkLink =
      String(
        remark.link ||
        remark.url ||
        ""
      ).trim();


    let text = "";


    if (
      remarkLink &&
      title
    ) {
      text =
        `<a href="${escapeHTML(remarkLink)}">${escapeHTML(title)}</a>`;

    } else if (title) {
      text =
        escapeHTML(
          title
        );
    }


    if (
      remarkContent
    ) {
      if (text) {
        text += "：";
      }


      text +=
        escapeHTML(
          remarkContent
        );
    }


    if (text) {
      remarkItems.push(
        `<li>${text}</li>`
      );
    }
  }


  if (
    remarkItems.length > 0
  ) {
    parts.push(
      `<p><strong>相关信息</strong></p><ul>${remarkItems.join("")}</ul>`
    );
  }


  return parts.join("");
}


/*
 * =========================================================
 * 北京时间 -> RFC822
 * =========================================================
 */
function parsePubDate(
  value
) {
  if (!value) {
    return "";
  }


  const match =
    String(value).match(
      /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
    );


  if (!match) {
    return "";
  }


  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
  ] = match;


  const utc =
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 8,
      Number(minute),
      Number(second)
    );


  return new Date(
    utc
  ).toUTCString();
}


/*
 * =========================================================
 * XML 转义
 * =========================================================
 */
function escapeXML(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&apos;"
    );
}


/*
 * =========================================================
 * HTML 转义
 * =========================================================
 */
function escapeHTML(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    );
}
