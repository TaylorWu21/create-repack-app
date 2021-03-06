#!/usr/bin/env node
const chalk       = require('chalk');
const clear       = require('clear');
const CLI         = require('clui');
const figlet      = require('figlet');
const inquirer    = require('inquirer');
const Preferences = require('preferences');
const Spinner     = CLI.Spinner;
const fs          = require('fs-extra');
const files       = require('./lib/files');
const argv        = require('minimist')(process.argv.slice(2));
const cwd = files.getCurrentDirectoryBase()
const exec = require('child_process').exec;
let dest;
let full = false;

const initialPrompt = () => {
  clear();
  console.log(
    chalk.bold.cyan( '(create-repack-app) => ' )
  );

  dest = argv._[0];
  full = argv.full;

  if (!dest) {
    console.log(chalk.bold.red('\nrepack <project> no project name specified'))
  } else if (files.directoryExists(`${cwd}/${dest}`)) {
    console.log(chalk.bold.red('\nA directory already exists with the name given'))
  } else {
    checkRailsVersions();
  }
}

const installRailsDeps = () => {
  copyStart();
  copyRootController()
  copyConfig()
}

const checkRailsVersions = () => {
  const cmd = 'gem list ^rails$'
  exec(cmd, (error, stdout, stderr) => {
    let match = false;
    stdout.split("(")[1].split(',').forEach( e => {
      if (/^([5-9]{1})|([0-9]{2,})/.test(parseFloat(e)))
      match = true;
    });

    if (match) {
      inquirer.prompt(
        [
          {
            type: 'list',
            name: 'cra',
            message: 'Do you have create react app installed and globally available?',
            choices: ['Yes', 'No']

          }
        ]
      ).then( (answer) => {
        let cra = false;
        if (answer.cra === 'Yes') {
          installApps()
        } else {
          console.log('Please instal create-react-app run:') 
          console.log(`${chalk.cyan('npm install -g create-react-app')} or ${chalk.cyan('yarn global add create-react-app')}`)

        }
      });
    } else {
      console.log('Rails v5 or higher required')
    }
  });
}

const portPrompt = () => {
  inquirer.prompt(
    [
      { 
        type: 'input',
        name: 'port',
        message: 'Rails server port',
        default: '3001'
      }
    ]
  ).then( answer => {
    if (answer.port === '3000') {
      console.log(chalk.yellow('PORT 3000 is the default PORT for create-react-app.  We reccomend using a different PORT.'))  
      inquirer.prompt(
        [
          {
            type: 'list',
            name: 'choice',
            message: 'Do you still want to use PORT 3000 for your rails server?',
            choices: ['Yes', 'No']

          }
        ]
      ).then( (answer) => {
        if (answer.choice === 'No')
          portPrompt();
        else {
          checkOptions(answer.port)
          updateClientPackage(answer.port)
        }
      });
    } else {
      checkOptions(answer.port)
      updateClientPackage(answer.port)
    }
  });
}

const checkOptions = (port) => {
  if (full) {
    const Gemfile = `${dest}/Gemfile`;
    let data = fs.readFileSync(Gemfile).toString().split("\n");
    const index = data.findIndex( line => line === "group :development, :test do" )
    const gems = ["gem 'omniauth'", "gem 'devise'", "gem 'devise_token_auth'"].join("\n");
    data.splice(index, 0, gems);
    fs.writeFile(Gemfile, data.join("\n"))
    exec('bundle', (error, stdout, stderr) => {
      inquirer.prompt(
        [
          {
             type: 'input',
             name: 'choice',
             message: 'What is your Devise Model',
             default: 'User'
          }
        ]
      ).then( (answer) => {
        exec(`cd ${dest} && spring stop && bundle exec rake db:create && bundle exec rails g devise_token_auth:install ${answer.choice} api/auth && bundle exec rake db:migrate`, (err, stdout, stderr) => { 
          if (err) 
            console.log('ERR ' + err);
          const Model = `${cwd}/${dest}/app/models/${answer.choice.toLowerCase()}.rb`;
          let data = fs.readFileSync(Model).toString().replace(" :confirmable,", "")
          fs.writeFile(Model, data)
          const config = `${cwd}/${dest}/config/environments/development.rb`
          let configData = fs.readFileSync(config).toString().split("\n")
          configData.splice(1, 0, `  config.action_mailer.default_url_options = { host: "localhost: ${port}" } `)
          fs.writeFile(config, configData.join("\n"))
          fin(port) 
        });
      })
    })

    let cmd = `cd ${dest}/client && yarn add redux redux-thunk react-redux react-router-dom axios redux-devise-axios semantic-ui-react semantic-ui-css`

    exec(cmd, () => {
      let from = `/example/client/`
      let to = `${dest}/client/`
      try {
        fs.copySync(__dirname + from, to)
      } catch (err) {
        console.log(err)
      }
    })

    exec(`cd ${dest}/client/src && rm -rf App.* *.css *.svg`)
  } else {
    fin(port)
  }
}

const updateClientPackage = (port) => {
  console.log('Updating client/package.json with proxy');
  const file = `${dest}/client/package.json`
  let obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  obj.proxy = `http://localhost:${3001}`
    const data = JSON.stringify(obj, null, 2); 
  fs.truncate(file, 0, () => {
    fs.writeFile(file, data, (err) => {
      if (err) {
        return console.log("An error occured");
      }
    });
  });
}

const installApps = () => {
  console.log();
  console.log('Installing Server...')
  const cmd = `rails new -T -d postgresql --api ${dest}`
  console.log('Installing Client...')
  console.log()
  console.log(chalk.cyan('This part takes a few minutes and a loading bar would actually slow that down. Please Wait.')) 

  exec(cmd, (error, stdout, stderr) => {
    if (!error) {
      const cmd = `cd ${dest} && create-react-app client`

      exec(cmd, (error, stdout, stderr) => {
        installRailsDeps()
        portPrompt()
      });
    } else {
      console.log(chalk.red(`ERROR: ${stderr}`))
    }
  })
}

const copyStart = () => {
  let message = `Building ${dest}`
  console.log()
  console.log(chalk.bold.green(message))
  console.log(chalk.bold.yellow('Installing project base'))
  try {
    fs.copySync(__dirname + '/example/package', `${cwd}/${dest}`)
  } catch (err) {
    console.error(err)
  }
}

const copyRootController = () => {
  try {
    fs.copySync(__dirname + '/example/base/controllers', `${cwd}/${dest}/app/controllers/`)
  } catch (err) {
    console.error(err)
  }
}

const copyConfig = () => {
  try {
    fs.copySync(__dirname + '/example/base/config', `${cwd}/${dest}/config/`)
  } catch (err) {
    console.error(err)
  }
}

const fin = (port) => {
  console.log();
  console.log(`👍   👍   👍   👍 `);
  console.log();
  console.log(chalk.bold.green('Success'))
  console.log()
  console.log(chalk.bold.cyan('GETTING STARTED:'))
  console.log(chalk.bold.white(`cd ${dest}`))
  console.log(chalk.bold.white(`rails s -p ${port}`))
  console.log(chalk.bold.white(`cd client`))
  console.log(chalk.bold.white('yarn start or npm run start'))
  console.log();
  console.log();
  console.log(chalk.bold.cyan('PRODUCTION:'))
  console.log(chalk.bold.white(`If deploying to heroku:`))
  console.log(chalk.bold.white('heroku buildpacks:clear'))
  console.log(chalk.bold.white('heroku buildpacks:set heroku/nodejs'))
  console.log(chalk.bold.white('heroku buildpacks:add heroku/ruby --index 2'))
  console.log();
  console.log();
  console.log(chalk.bold.white('If not deploying to heroku:'))
  console.log(chalk.bold.white(`From root folder: yarn build && yarn deploy`))
}

initialPrompt();
