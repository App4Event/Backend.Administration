#!/usr/bin/env node

const fn = require('../lib/app4event/adminAccounts').makeAdmin

fn(process.argv[2], process.argv[3], process.argv[4])
  .then(() => {
    console.log('Job done. Goodbye.')
    process.exit(0)
  })
  .catch(error => {
    console.log('Epic failure when trying to create admin')
    console.log(error.stack)
    process.exit(1)
  })
