const express = require('express'),
    exphbs = require('express-handlebars'),
    logger = require('morgan'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override'),
    session = require('express-session'),
    passport = require('passport'),
    LocalStrategy = require('passport-local'),
    TwitterStrategy = require('passport-twitter'),
    FacebookStrategy = require('passport-facebook'),
    GoogleStrategy = require('passport-google-oauth').OAuth2Strategy,
    request = require('request'),
    app = express(),
    MongoClient = require('mongodb').MongoClient,
    // yelp = require('yelp-fusion'),
    // asyncx = require('async'),
    qs = require('qs'),
    bcrypt = require('bcryptjs');


    var config = require('./config.js');
    var funct = require('./functions.js');
    var User = require('./users.js');


    var mongodbUrl = config.mongodbUri;


function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  req.session.error = 'Please sign in!';
  res.redirect('/signin');
}


app.use(express.static('static'))

// app.use(logger('combined'));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(session({secret: 'supernova', saveUninitialized: true, resave: true}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('static'))


passport.use('local-signin', new LocalStrategy(
  {passReqToCallback : true}, //allows us to pass back the request to the callback
  function(req, username, password, done) {
    funct.localAuth(username, password)
    .then(function (user) {
      if (user) {
        console.log("LOGGED IN AS: " + user.username);
        req.session.success = 'You are successfully logged in ' + user.username + '!';
        done(null, user);
      }
      if (!user) {
        console.log("COULD NOT LOG IN");
        req.session.error = 'Could not log user in. Please try again.'; //inform user could not log them in
        done(null, user);
      }
    })
    .fail(function (err){
      console.log(err.body);
    });
  }
));

// Use the LocalStrategy within Passport to register/"signup" users.
passport.use('local-signup', new LocalStrategy(
  {passReqToCallback : true}, //allows us to pass back the request to the callback
  function(req, username, password, done) {
    funct.localReg(req, username, password)
    .then(function (user) {
      if (user) {
        console.log("REGISTERED: " + user.displayName);
        req.session.success = 'You are successfully registered and logged in ' + user.displayName + '!';
        done(null, user);
      }
      if (!user) {
        console.log("COULD NOT REGISTER");
        req.session.error = 'That username is already in use, please try a different one.'; //inform user could not log them in
        done(null, user);
      }
    })
    .fail(function (err){
      console.log(err.body);
    });
  }
));


passport.use(new TwitterStrategy({
    consumerKey: config.TWITTER_CONSUMER_KEY,
    consumerSecret: config.TWITTER_CONSUMER_SECRET,
    callbackURL: config.url + "auth/twitter/callback"
  },
  function(token, tokenSecret, profile, cb) {
    // In this example, the user's Twitter profile is supplied as the user
    // record.  In a production-quality application, the Twitter profile should
    // be associated with a user record in the application's database, which
    // allows for account linking and authentication with other identity
    // providers.
    // console.log(profile);
    User.findOrCreate(profile, cb);
  }
));


passport.use(new GoogleStrategy({
    clientID: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    callbackURL: config.url + "auth/google/callback"
  },
  function(accessToken, refreshToken, profile, done) {
      User.findOrCreate(profile, done);
  }
));

passport.use(new FacebookStrategy({
    clientID: config.FACEBOOK_CLIENT_ID,
    clientSecret: config.FACEBOOK_CLIENT_SECRET,
    callbackURL: config.url + "auth/facebook/callback"
  },
  function(accessToken, refreshToken, profile, done) {
      User.findOrCreate(profile, done);
  }
));


passport.serializeUser(function(user, done) {
  console.log("serializing " + user.username);
  done(null, user._id);
});

passport.deserializeUser(function(obj, done) {
  console.log("deserializing " + obj);
  MongoClient.connect(mongodbUrl, function (err, db) {
      var collection = db.collection('users');
      collection.findOne({_id: require('mongodb').ObjectID(obj)}).then(function(result){
        //   console.log(result);
          done(null, result);
      });
  });
});


app.use(function(req, res, next){
  var err = req.session.error,
      msg = req.session.notice,
      success = req.session.success;

  delete req.session.error;
  delete req.session.success;
  delete req.session.notice;

  if (err) res.locals.error = err;
  if (msg) res.locals.notice = msg;
  if (success) res.locals.success = success;

  next();
});



var hbs = exphbs.create({ defaultLayout: 'main', helpers: require('./handlebars-helpers.js').helpers });
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');



app.get('/', function(req, res){
    res.render('allpics', {user: req.user});
});

app.get('/mypics', ensureAuthenticated, function(req, res){
    res.render('pics', {user: req.user, username: req.user.username});
});

app.get('/user/:username', function(req, res){
    res.render('pics', {user: req.user, username: req.params.username});
});

app.get('/getAllPics', function(req, res) {
    MongoClient.connect(mongodbUrl, function (err, db) {
        var collection = db.collection('pics');
        collection.find().toArray(function(err, results) {
            res.json(results);
        });
    });
});


app.get('/getUserPics', function(req, res) {
    MongoClient.connect(mongodbUrl, function (err, db) {
        var collection = db.collection('pics');
        collection.find({"user.name": req.query.username}).toArray(function(err, results) {
            res.json(results);
        });
    });
});

app.get('/deletePic', function(req, res) {
    MongoClient.connect(mongodbUrl, function (err, db) {
        var collection = db.collection('pics');
        collection.remove({_id: require('mongodb').ObjectID(req.query.id)}, function(err) {
            res.json({status: 'ok'});
        });
    });
});


app.get('/addPic', function(req, res) {
    MongoClient.connect(mongodbUrl, function (err, db) {
        var collection = db.collection('pics');
        collection.insert({img: req.query.img, text: req.query.text,like: 0, user: {name: req.user.username, img: req.user.avatar}}, function(err, data) {
            res.json(data.ops[0]);
        })
    });
});


app.get('/toggelLike', function(req, res) {
    console.log(req.query.id);
    console.log(req.query.likes);
    MongoClient.connect(mongodbUrl, function (err, db) {
        var collection = db.collection('likes');
        var pics = db.collection('pics');
        collection.findOne({picId: require('mongodb').ObjectID(req.query.id), userId: req.user._id}).then(function(exist) {
            console.log();
            if (exist) {
                collection.remove(exist, function(err) {
                    pics.update({_id: require('mongodb').ObjectID(req.query.id)}, { $inc: {like : -1}}, function(errw) {
                        // console.log(errw);
                        res.json({newlikes : Number(req.query.likes)-1})
                    })
                })
            }
            else {
                collection.insert({picId: require('mongodb').ObjectID(req.query.id), userId: req.user._id}, function(er, da) {
                    pics.update({_id: require('mongodb').ObjectID(req.query.id)}, { $inc: {like : 1}}, function(errw) {
                        // console.log(errw);
                        res.json({newlikes : Number(req.query.likes)+1})
                    })
                })
            }

            // res.json({status: 'ok'});

        });
    });
});


app.get('/set', function(req, res){
    res.render('set', {user: req.user});
});


app.post('/setinfo', function(req, res) {
    MongoClient.connect(mongodbUrl, function (err, db) {
        var collection = db.collection('users');
        var obj = {};
        if (req.body.city) {
            obj['city'] = req.body.city;
        }
        if (req.body.state) {
            obj["state"] = req.body.state;
        }
        console.log(obj);
        console.log(req.user._id);
        collection.update({_id : require('mongodb').ObjectID(req.user._id)}, { $set: obj}, function(err) {
            console.log(err);
            req.session.success = 'You are successfully changed your city and state!';
            res.redirect('set');
        });
    });

});



app.post('/setpass', function(req, res) {

    var hash = req.user.password;

    console.log(req.body.password);

    if (bcrypt.compareSync(req.body.password, hash)) {
        if (req.body.newPassword.length < 3) {
            req.session.error = 'New Password Should Be 3 Or More Chars!';
            res.redirect('/set');
        } else {
            MongoClient.connect(mongodbUrl, function (err, db) {
                var collection = db.collection('users');
                var hash1 = bcrypt.hashSync(req.body.newPassword, 8);

                console.log(hash1);
                collection.update({_id : require('mongodb').ObjectID(req.user._id)}, { $set: { password: hash1 } }, function(err) {
                    console.log(err);
                    req.session.success = 'You are successfully changed your city and state!';
                    res.redirect('/set');
                });
            });
        }
    } else {
      req.session.error = 'Your password is not correct!';
      res.redirect('/set');
    }

});





app.get('/signin', function(req, res){
    req.session.q = req.query.q;
    res.render('signin');
});

app.post('/local-reg', passport.authenticate('local-signup', {
  successRedirect: '/',
  failureRedirect: '/signin'
  })
);

app.post('/login', passport.authenticate('local-signin', {
  successRedirect: '/',
  failureRedirect: '/signin'
  })
);


app.get('/auth/twitter', passport.authenticate('twitter'));


app.get('/auth/twitter/callback',
  passport.authenticate('twitter', { failureRedirect: '/signin' }),
  function(req, res) {
    res.redirect('/');
  });




app.get('/logout', function(req, res){
  var name = req.user.username;
  console.log("LOGGIN OUT " + req.user.username)
  req.logout();
  res.redirect('/');
  req.session.notice = "You have successfully been logged out " + name + "!";
});



app.get('/auth/google',
  passport.authenticate('google', { scope: ['openid profile email'] }));


app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/signin' }),
  function(req, res) {
    res.redirect('/');
  });


app.get('/auth/facebook', passport.authenticate('facebook'));

app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { successRedirect: '/',
                                      failureRedirect: '/login' }));

var port = process.argv[2];
app.listen(port, function() {
  console.log('server listening on port ' + port);
  console.log(config.url);
});
