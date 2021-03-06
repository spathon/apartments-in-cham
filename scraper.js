const path = require('path')
const request = require('superagent')
const cheerio = require('cheerio')
const crypto = require('crypto')
const urljoin = require('url-join')

const { Apartment, sequelize } = require('./models')
Apartment.sync()
const sites = require('./config/agencies')

function init () {
  const promises = sites.map(async site => {
    console.log('Start', site.title)
    let response
    try {
      if (site.post) {
        response = await request
          .post(site.url)
          .type('form')
          .send(site.post)
      } else {
        response = await request.get(site.url)
      }
    } catch (e) {
      console.error('Fetch error:', e.status, site)
      return null
    }
    let $ = cheerio.load(response.text)
    const scraper = require(path.join(__dirname, './scrapers/', site.id))
    const result = scraper($, response)

    const data = result
      .map(apartment => {
        const hash = crypto.createHash('sha256')
        hash.update(apartment.url)
        apartment.hash = hash.digest('hex')
        apartment.agencyId = site.id

        if (apartment.url && !apartment.url.startsWith('http')) {
          apartment.url = urljoin(site.baseUrl, apartment.url)
        }

        if (apartment.img && !apartment.img.startsWith('http')) {
          apartment.img = urljoin(site.baseUrl, apartment.img)
        }

        return apartment
      })

    console.log('Finish', site.title)
    return {
      name: site.title,
      data,
      count: data.length
    }
  })
  return Promise.all(promises)
}

init()
  .then(async (agencies) => {
    for (const agency of agencies) {
      if (!agency) continue
      let results = 0
      let newApartments = 0
      for (const apt of agency.data) {
        const res = await Apartment.findOrCreate({ where: { hash: apt.hash }, defaults: apt })
        results++
        if (res[1]) newApartments++
      }
      console.log(agency.name, 'Total:', results, 'New:', newApartments)
    }

    sequelize.close()
    console.log('done')
  })
  .catch(e => {
    console.log(e)
  })
