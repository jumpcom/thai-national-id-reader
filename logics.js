const utils = require('./utils')
const DataURI = require('datauri')
const adpu = require('./adpu')
const datauri = new DataURI()

const STATUS = {
  START: 'START',
  READING: 'READING',
  COMPLETE: 'COMPLETE',
  ERROR: 'ERROR'
}

const parseDateToString = (date) => {
  return `${parseInt(date.slice(0, 4) - 543)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}

const readData = async (reader, protocol, withPhoto, callback) => {
  let totalStep = 4

  if (withPhoto) {
    totalStep = 4 + adpu.CMD_GET_PHOTO.length
  }

  try {
    // Select
    callback({ status: STATUS.START })
    await sendCommand(reader, adpu.CMD_SELECT, protocol)

    // Get Data
    const citizenId = await sendCommand(reader, adpu.CMD_CID, protocol)
    callback({ status: STATUS.READING, obj: { step: 1, of: totalStep, message: 'citizen_id' } })

    const rawPersonalInfo = await sendCommand(reader, adpu.CMD_PERSON_INFO, protocol)
    callback({ status: STATUS.READING, obj: { step: 2, of: totalStep, message: 'personal_info' } })

    const rawAddress = await sendCommand(reader, adpu.CMD_ADDRESS, protocol)
    callback({ status: STATUS.READING, obj: { step: 3, of: totalStep, message: 'address' } })

    const rawIssueExpire = await sendCommand(reader, adpu.CMD_ISSUE_EXPIRE, protocol)
    callback({ status: STATUS.READING, obj: { step: 4, of: totalStep, message: 'issue_expire' } })

    let data = {}
    data.citizenId = citizenId

    const ThaiPersonalInfo = rawPersonalInfo.substring(0, 100).split('#').map(info => info.trim());
    const EnglishPersonalInfo = rawPersonalInfo.substring(100, 200).split('#').map(info => info.trim());

    data.titleTH = ThaiPersonalInfo[0]
    data.firstNameTH = ThaiPersonalInfo[1]
    data.middlenameTH = ThaiPersonalInfo[2]
    data.lastNameTH = ThaiPersonalInfo[3]

    data.titleEN = EnglishPersonalInfo[0]
    data.firstNameEN = EnglishPersonalInfo[1]
    data.middlenameEN = EnglishPersonalInfo[2]
    data.lastNameEN = EnglishPersonalInfo[3]

    const tempBirthday = rawPersonalInfo.substring(200, 208)
    data.birthday = parseDateToString(tempBirthday)

    if (rawPersonalInfo.substring(208, 209) === '1') {
      data.gender = 'male'
    }
    else if (rawPersonalInfo.substring(208, 209) === '2') {
      data.gender = 'female'
    }
    else {
      data.gender = 'other'
    }

    const infos = rawAddress.split('#').map(info => info.trim());

    const houseNo = infos[0];
    const villageNo = infos[1];
    const lane = infos[2];
    const road = infos[3];
    const subDistrict = infos[5];
    const district = infos[6];
    const province = infos[7];

    data.rawAddress = { houseNo, villageNo, lane, road, subDistrict, district, province };

    const tempAddress = rawAddress.split('#').filter(o => o !== '')
    data.address = tempAddress.join(' ')

    data.issue = parseDateToString(rawIssueExpire.slice(0, 8))
    data.expire = parseDateToString(rawIssueExpire.slice(8, 16))

    if (withPhoto) {
      const rawPhoto = await readPhoto(reader, protocol, (step) => {
        callback({ status: STATUS.READING, obj: { step: 4 + step, of: totalStep, message: 'photo' } })
      })

      const encodedData = datauri.format('.jpg', rawPhoto)
      data.photo = encodedData.content
    }

    callback({ status: STATUS.COMPLETE, obj: data })
  }
  catch (e) {
    callback({ status: STATUS.ERROR, obj: e })
  }

  reader.disconnect(reader.SCARD_LEAVE_CARD, err => {
    if (err) {
      return
    }
  })
}

const readPhoto = async (reader, protocol, progress) => {
  let bufferList = []
  for (let i in adpu.CMD_GET_PHOTO) {
    await transmit(reader, adpu.CMD_GET_PHOTO[i][0], protocol)

    let result = await transmit(reader, adpu.CMD_GET_PHOTO[i][1], protocol)
    if (result.length > 2) {
      result = result.slice(0, -2)
    }

    bufferList.push(result)
    progress(bufferList.length)
  }

  const tempBuffer = Buffer.concat(bufferList)
  return tempBuffer
}

const sendCommand = async (reader, command, protocol) => {
  let data = null
  for (let i in command) {
    data = await transmit(reader, command[i], protocol)
  }
  return utils.hex2string(data.toString('hex'))
}

const transmit = async (reader, command, protocol) => {
  return new Promise((resolve, reject) => {
    reader.transmit(Buffer.from(command), 256, protocol, (err, data) => {
      if (err) {
        reject(err)
      }
      else {
        resolve(data)
      }
    })
  })
}

module.exports = {
  readData,
  STATUS
}
