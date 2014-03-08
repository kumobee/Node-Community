var S = require( 'string' );
var models = require( '../models' );
var marked = require( 'marked' );
var async = require( 'async' );
var helpers = require( '../helpers' );
var moment = require('moment');
var config = require('../config');
var slugs = require('slug');
var util = require('util');
moment.lang(config.lang);

exports.home = function( req, res ){

    var newPostUrl = ( req.session.user ) ? '/training/create' : '/user/login?back=/training/create';

    var publisher = ( req.session.user && (req.session.user.range === 1 || req.session.user.range === 2) ) ? true: false;

    var q = models.training.find({}).sort({'created_at': -1}).limit(10);

    q.exec(function(err, posts) {
        if( err ){
            res.send( err );
        }
        else{
            if( posts ){
                var i = 0;
                posts.forEach(function(post){
                    posts[i].date =  moment(post.created_at).fromNow();
                    i++;
                });

                res.render( helpers.site.template( 'training/index' ), { publisher: publisher, newPostUrl: newPostUrl, posts: posts, marked:marked });
            }
            else{
                res.send('0 trainings');
            }
        }

    });

}

exports.get = function( req, res ){

    if( req.method === 'POST' ){
        models.training.findOne({slug: req.params.slug }, function (err, post) {
            if (!err && post && !S(req.body.content).isEmpty() ){

                var comment = {};
                var author = {};
                author.username = req.session.user.username;
                author.email = req.session.user.email;
                author.avatar = req.session.user.avatar;
                comment.author = author;
                comment.content = S(req.body.content).stripTags().s;

                if( !S(comment.content).isEmpty() ){

                    post.comments.push( comment );
                    post.save(function(err){
                        if( !err ){
                            // Add activity
                            var activity = {
                                name: req.session.user.name,
                                username: req.session.user.username,
                                slug: req.params.slug,
                                title: post.title
                            };
                            helpers.users.addActivity('new_training_comment', activity, req.socketio);

                            // Send email
                            var email = {
                                text: util.format( res.lingua.content.notify.comment.body, post.title, res.locals.siteUrl + '/training/' + post.slug ),
                                to: post.author.username + '<' + post.author.email + '>',
                                subject: util.format( res.lingua.content.notify.comment.subject, post.title )
                            }
                            helpers.email.send( email );

                            // Redirect
                            res.redirect( req.path );
                        }
                    });

                }
                else{
                    res.redirect( req.path );
                }

            }
            else{
                res.redirect( req.path );
            }
        });

    }
    else{

        async.parallel({
                post: function(callback){

                    models.training.findOne({ slug: req.params.slug },function(err,post){

                        if( !err && post ){

                            post.title = helpers.util.parseTitle(post.title);

                            post.date = moment(post.created_at).format('MMMM Do YYYY, h:mm:ss a');

                            if( post.comments.length > 0 ){
                                var i = 0;
                                post.comments.forEach(function(comment){
                                    post.comments[i].date = moment(comment.created_at).fromNow();
                                    i++;
                                });
                            }

                            callback(null, post);

                        }

                        else{

                            callback(null, null);

                        }

                    });

                },
                posts: function(callback){

                    var p = models.training.find({}).sort({'created_at': -1}).limit(50);

                    p.exec(function(err, posts) {

                        if( !err && posts ){

                            callback(null, posts);

                        }
                        else{

                            callback(null, null);

                        }


                    });

                }
            },
            function(err, results) {

                if( results.post && results.posts ){

                    var permissions = false;

                    var user = user || req.session.user;

                    if( user && req.session.user.username === results.post.author.username ){
                        permissions = true;
                    }

                    res.render(helpers.site.template( 'training/article' ),{ marked: new helpers.marked.parse(marked), post: results.post, posts: results.posts, user: user, permissions: permissions });

                }
                else{
                    res.render( helpers.site.template( '404' ) );
                }

            });

    }


}

exports.create = function( req, res ){
    switch ( req.method ){
        case 'GET':
            res.render(helpers.site.template( 'training/create' ),{ form: req.body });
            break;
        case 'POST':

            var error = null;
            var title = req.body.title;
            var content = req.body.content;

            if( S(title).isEmpty() ){
                error = res.lingua.content.questions.create.form.empty.title;
            }

            if( S(content).isEmpty() ){
                error = res.lingua.content.questions.create.form.empty.content;
            }


            title = S(title).stripTags().s;
            content = S(content).stripTags().s;

            var slug = S(slugs(title)).slugify().s;

            var author = {};
            author.username = req.session.user.username;
            author.email = req.session.user.email;
            author.avatar = req.session.user.avatar;

            //
            models.training.findOne({ slug: slug },function(err,post){
                if( err ){
                    error = err;
                }
                else{
                    if( post ){

                        error = res.lingua.content.questions.create.form.exist;
                        res.render(helpers.site.template( 'training/create' ), { error: error, form: req.body });

                    }
                    else{

                        if( error ){

                            res.render(helpers.site.template( 'training/create' ), { error: error, form: req.body });

                        }
                        else{

                            var new_post = new models.training;

                            new_post.slug = slug;
                            new_post.title = title;
                            new_post.content = content;
                            new_post.author = author;

                            new_post.save(function( err ){
                                if( err ){
                                    res.render(helpers.site.template( 'training/create' ), { error: error, form: req.body });
                                }
                                else{
                                    var params = {};
                                    params.name = req.session.user.name;
                                    params.username = req.session.user.username;
                                    params.slug = slug;
                                    params.title = title;
                                    helpers.users.addActivity('new_training', params, req.socketio);
                                    res.redirect('/training/'+slug);
                                }

                            });

                        }


                    }


                }

            });

            break;
    }

}


exports.edit = function( req, res ){

    switch ( req.method ){
        case 'GET':

            models.training.findOne({ slug: req.params.slug },function(err,post){
                if( !err && post ){

                    if( post.author.username === req.session.user.username ){

                        req.body.title = post.title;
                        req.body.content = post.content;
                        res.render(helpers.site.template( 'training/create' ),{ form: req.body, mode: "edit" });

                    }
                    else{
                        res.redirect('/');
                    }

                }
                else{
                    res.redirect('/');
                }

            });

            break;
        case 'POST':

            var error = null;
            var title = req.body.title;
            var content = req.body.content;

            if( S(title).isEmpty() ){
                error = res.lingua.content.questions.create.form.empty.title;
            }

            if( S(content).isEmpty() ){
                error = res.lingua.content.questions.create.form.empty.content;
            }


            title = S(title).stripTags().s;
            content = S(content).stripTags().s;

            models.training.findOne({ slug: req.params.slug },function(err,post){
                if( err ){
                    res.redirect('');
                }
                else{
                    if( post ){

                        if( post.author.username === req.session.user.username ){

                            post.title = title;
                            post.content = content;

                            post.save(function( err ){
                                if( err ){
                                    res.render(helpers.site.template( 'training/create' ), { error: error, form: req.body });
                                }
                                else{
                                    res.redirect('/training/'+req.params.slug);
                                }

                            });

                        }
                        else{
                            res.redirect('/questions/'+req.params.slug);
                        }

                    }

                }

            });

            break;
    }
}