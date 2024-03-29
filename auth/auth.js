const express = require('express');
const router = express.Router();
const User = require('../auth/auth-mongoose');
const Post = require('../posts/singlepost-mongoose')
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const checkAuth = require('./auth-validator');
const exportsFile = require('../exports');
const Notification = require('../notification/notification-mongoose')


const upload = exportsFile.upload;

var ObjectId = require('mongodb').ObjectId;


router.get('/searchUsers', (req, res) => {
    if (!req.query.searchItem) {
        return res.status(200).json({
            data: []
        });
    }
    req.query.searchItem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regexQuery = new RegExp("^" + req.query.searchItem, "i");;
    User.aggregate([
        {
            $match: { nickname: { $regex: regexQuery } }
        },
        {
            $group: {
                _id: {
                    _id: "$_id",
                    nickname: "$nickname",
                    profilePic: "$afterLogin.profilePic",
                    notifications: "$notifications"
                }
            }
        },
        {
            $limit: 40
        }
    ])
    .then(data => {
        res.status(200).json({
            data: data
        })
    })
    .catch(err => {
        console.log(err)
        res.status(200).json({
            data: []
        })
    })
})

router.post('', (req, res, cb) => {
    bcrypt.hash(req.body.password, 10)
    .then(hash => {
        new User({
            email: req.body.email,
            nickname: req.body.nickname,
            password: hash,
            notifications: [],
            afterLogin: req.body.afterLogin
        })
        .save().then((user) => {
            res.status(200).json({
                
            })
        })
        .catch(err => {
            console.log(err)
            res.status(500).json({
                message: err
            });
        })
    })
});

router.get('/', (req, res, cb) => {
    // let myId = req.userData.userId;
    User.find()
    .then(data => {
        res.status(200).json({
            data
        })
    })
    .catch(err => {
        res.status(500).json({
            message: 'Couldn\'t reach the DB'
        });
    })
});


router.post('/login', (req, res, cb) => {
    let foundUser;
    
    User.findOne({nickname: req.body.nickname})
    .then(user => {
        if(user == false || user == undefined || user == null){
            return
        };
        foundUser = user;
        return bcrypt.compare(req.body.password, user.password)
    })
    .then(bool => {
        if(bool == false || bool == undefined || bool == null){
            res.status(400).json({
                message: 'User not found'
            });
            return
        }

        foundUser.updateOne(
            {
                $set: {
                    'afterLogin.connected': true
                }
            },
            {new: true}
        )
        .then(() => {
            const token = jwt.sign(
                {email: foundUser.email, userId: foundUser._id},
                process.env.JWT_SECRET_KEY,
                {expiresIn: '3h'}
            );
            res.status(200).json({
                token: token,
                userId: foundUser._id,
                profilePic: foundUser.afterLogin.profilePic
            })
        })
        .catch(err => {
            res.status(500).json({
                message: 'User not found'
            });
            console.log(err)
        });
    })
    .catch(err => {
        res.status(500).json({
            message: 'User not found'
        });
    })
});



router.get('/autoLogin', (req, res) => {
    const verifiedT = jwt.verify(req.query.token, process.env.JWT_SECRET_KEY);
    User.findOne({_id: new ObjectId(verifiedT.userId)})
    .then(foundUser => {
        res.status(201).json({
            userId: foundUser._id,
            profilePic: foundUser.afterLogin.profilePic,
            nickname: foundUser.nickname
        })
    })
    .catch(err => {
        console.log(err)
        res.status(404).json({
            error: 'user not found'
        })
    })
})

// router.put('/renewSocketId', checkAuth, (req, res) => {
//     User.findOneAndUpdate(
//         {_id: req.userData.userId},
//         {$set: {socketId: req.body.socketId}},
//         {new: true}
//     )
//     .then()
//     .catch(err => {
//         res.status(500).json({
//             err
//         })
//     })
// })


router.get('/singleUser', (req, res, cb) => {
    User.aggregate([
        {
            $match: {
                _id: new ObjectId(req.query.id)
            }
        },
        {
            $group: {
                _id : "$_id",
                afterLogin: {'$first' : '$afterLogin'},
                nickname: {"$first": '$nickname'},
            }
        }
    ])
    .then(user => {
        let returnUser = user[0];
        res.status(200).json({
            returnUser
        })
    })
    .catch(err => {
        console.log(err)
        res.status(501).json({
            message: 'User not found'
        });
    })
})

router.get('/usersPosts', (req, res) => {
    Post.count({creatorId: req.query.id}).then(COUNT => {
        const increasingAmount = +req.query.incAmount;
        let fetchAmount = 20;
        let toSkip = COUNT - increasingAmount;   
        if(toSkip < 0){
            if(toSkip + fetchAmount > 0){
                fetchAmount = toSkip + fetchAmount;
                toSkip = 0;
            } else if(toSkip + fetchAmount <= 0){
                res.status(200).json({
                    posts: []
                })
                return
            }
        }

        Post.aggregate([
            { $match: {'creatorId': req.query.id} },
            { $skip: toSkip },
            { $limit: fetchAmount },
            { $project: { comments: 0 }}
        ])
        .then(POSTS => {
            const posts = POSTS.reverse()
            res.status(200).json({
                posts: posts,
                postCount: COUNT
            })
        }) 
        .catch(err => {
            console.log(err)
            res.status(501).json({
                message: 'Couldn\'t fetch posts'
            });
        })
    })
})

// User.updateMany(
//     {$set: {'$afterLogin.coverPic': ''}}
// ).then(data => {
//     console.log(data)
// })

router.get('/mySelf', checkAuth, (req, res) => {
    User.aggregate([
        {
            $match: {
                "_id": new ObjectId(req.userData.userId)
            }
        },
        {
            $group:{
                _id: '$_id',
                profilePic: {'$first': '$afterLogin.profilePic'}
            }
        }
    ])
    .then(user => {
        res.status(201).json({
            user
        })
    })
    .catch(err => {
        res.status(500).json({
            err
        })
    })
})

// User.updateMany({$set: {'afterLogin.gotReqs': []}}).then(data=>console.log(data))

router.put('/addFriend', checkAuth, (req, res) => {
    let haveSent = false;
    let haveRecieved = false;
    let areFriends = false;

    if(req.userData.userId === req.body.userId){
        return
    }
    
    User.findOne({_id: req.userData.userId})
    .then(me => {
        for(let i of me.afterLogin.friends){
            if(i === req.body.userId){
                removeFriend();
                areFriends = true;
                console.log('this happens if you are friends' )
                return
            }
        }
        if(!areFriends){
            console.log('this happens if you are not friends' )
            for(let i of me.afterLogin.gotReqs){
                if(i === req.body.userId){
                    if(req.body.deleteTheirReq){
                        cancelTheirRequest()
                        console.log('canceltheirs')
                    } else {
                        console.log('conffirm')
                        confirm();
                    }
                    haveRecieved = true;
                    console.log('this happens if you have recieved a request' )
                    return
                }
            }
        }
        if(!haveRecieved){
            console.log('this happens if you haven\'t recieved a request' )
            for(let i of me.afterLogin.sentReqs){
                if(i === req.body.userId){
                    cancelYourRequest()
                    console.log('this happens if we have already sent')
                    haveSent = true;
                    return
                }
            }
            if(!haveSent){
                console.log('this happens if both are false and we have to send')
                send()
                return
            }
        }
        
        // action |
        //        V
        function cancelTheirRequest(){
            User.findOneAndUpdate(
                {_id: req.userData.userId},
                {$pull: {'afterLogin.gotReqs': req.body.userId}}
            )
            .then(user => {

                User.findOneAndUpdate(
                    {_id: req.body.userId},
                    {$pull: {'afterLogin.sentReqs': req.userData.userId}}
                )
                .then(user => {
                    res.status(201).json({
                        message: 'Send a friend request',
                        theirMessage: 'Send a friend request'
                    })
                })
                .catch(err => {
                    res.status(501).json({
                        message: 'User not found1'
                    });
                })

            })
            .catch(err => {
                res.status(501).json({
                    message: 'User not found1'
                });
            })

            // otheruer
            
        }
        function cancelYourRequest(){
            User.findOneAndUpdate(
                {_id: req.userData.userId},
                {$pull: {'afterLogin.sentReqs': req.body.userId}}
            )
            .then(user => {
                
                // otheruer
                User.findOneAndUpdate(
                    {_id: req.body.userId},
                    {$pull: {'afterLogin.gotReqs': req.userData.userId}}
                )
                .then(user => {
                    res.status(201).json({
                        message: 'Send a friend request',
                        theirMessage: 'Send a friend request'
                    })
                })
                .catch(err => {
                    res.status(501).json({
                        message: 'User not found1'
                    });
                })
            
            })
            .catch(err => {
                res.status(501).json({
                    message: 'User not found1'
                });
            })
        }
        function removeFriend(){
            User.findOneAndUpdate(
                {_id: req.userData.userId},
                {$pull: {'afterLogin.friends': req.body.userId}}
            )
            .then(user => {
                User.findOneAndUpdate(
                    {_id: req.body.userId},
                    {$pull: {'afterLogin.friends': req.userData.userId}}
                )
                .then(USER => {
                    res.status(201).json({
                        change: 'Removed',
                        message: 'Send a friend request',
                        theirMessage: 'Send a friend request',
                    })
                })
                .catch(err => {
                    res.status(501).json({
                        message: 'User not found1'
                    });
                })
            })
            .catch(err => {
                res.status(501).json({
                    message: 'User not found1'
                });
            })
        }
        function confirm(){
            User.findOneAndUpdate(
                {_id: req.userData.userId},
                {
                    $pull: {'afterLogin.gotReqs': req.body.userId},
                    $addToSet: {'afterLogin.friends': req.body.userId}
                }
            )
            .then(me => {
                const ME = new Notification({
                    text: `${me['nickname']} confirmed your friend request`,
                    linker: String(me['_id']),
                    type: 'userProfile',
                    date: new Date()
                })
                // second started
                User.findOneAndUpdate(
                    {_id: req.body.userId},
                    {
                        $pull: {'afterLogin.sentReqs': req.userData.userId },
                        $addToSet: { 'afterLogin.friends': req.userData.userId },
                        $push: {
                            'notifications': {
                                $each: [ME],
                                $position: 0
                            }
                        },
                    }
                )
                .then(otherUser => {
                    res.status(201).json({
                        change: 'Added',
                        message: 'Friends',
                        theirMessage: 'Friends',
                        sendNot: true
                    })
                })
                .catch(err => {
                    res.status(501).json({
                        message: 'User not found1'
                    });
                })
                // second ended
                })
            .catch(err => {
                res.status(501).json({
                    message: 'User not found1'
                });
            })
        }
        function send(){
            User.findOneAndUpdate(
                {_id: req.userData.userId}, 
                {$addToSet: {"afterLogin.sentReqs": req.body.userId}}
            )
            .then(me => {
                const ME = new Notification({
                    text: `${me['nickname']} sent you a friend request`,
                    linker: String(me['_id']),
                    type: 'userProfile',
                    date: new Date()
                });

                User.updateOne(
                    {
                        _id: req.body.userId
                    },
                    {
                        $addToSet: {'afterLogin.gotReqs': req.userData.userId},
                        $push: {
                            'notifications': {
                                $each: [ME],
                                $position: 0
                            }
                        },
                    }
                )
                .then(user => {
                    res.status(201).json({
                        message: 'You sent a friend request',
                        theirMessage: 'Confirm',
                        sendNot: true
                    })
                })
                .catch(err => {
                    console.log(err)
                    res.status(501).json({
                        message: 'User not found1'
                    });
                })
            })
            .catch(err => {
                console.log(err, 'error occ')
                    res.status(501).json({
                        message: 'User not found'
                    });
            })
        }
    })
});


router.get('/getMyFriends', checkAuth, (req, res) => {
    User.findOne({_id: req.userData.userId}).then(me => {
        let contactQuery = []
        if(req.query.type === 'friends') {
            contactQuery = me.afterLogin.friends.slice();
        } else if(req.query.type === 'connections') {
            contactQuery = me.afterLogin.connections.slice();
        }
        User.aggregate([
            {
                $match: {
                    '_id': {
                        $in: contactQuery.map(id => new ObjectId(id))
                    }
                }
            },
            {
                $group: { 
                    _id: "$_id", 
                    nickname:  {"$first": "$nickname"},
                    profilePic: {'$first': '$afterLogin.profilePic'},
                    connected: {'$first': '$afterLogin.connected'}
                }
            }
        ])
        .then(users => {
            res.status(200).json({
                users
            })
        })
        .catch(err => {
            res.status(500).json({
                err
            })
        })
    })
});

// router.get('/emitFriends', checkAuth, (req,res) => {
//     User.findOne({_id: req.userData.userId}).then(me => {
//         let friendsQuery = me.afterLogin.friends.slice();
//         User.aggregate([
//             {
//                 $match: {
//                     '_id': {
//                         $in: friendsQuery.map(id => new ObjectId(id))
//                     }
//                 }
//             },
//             {
//                 $group: { 
//                     _id: "$_id", 
//                 }
//             }
//         ])
//         .then(users => {
//             console.log(users, 'usersIds')
//             res.status(200).json({
//                 users
//             })
//         })
//         .catch(err => {
//             res.status(400).json({
//                 err
//             })
//         })
//     })
// })

router.put('/profilePic', checkAuth, upload.single('profilePic'), (req, res) => {
    let cloudinaryUrl = "";
    if(req.file && typeof(req.file) === "object"){
        exportsFile.uploadOnCloud(req.file).then(data => {
            cloudinaryUrl = data.secure_url;
            mainFunction()
        })
    } else {
        mainFunction()
    };

    function mainFunction() {
        User.findOneAndUpdate(
            {_id: req.userData.userId},
            {
                $set: {
                    'afterLogin.profilePic': cloudinaryUrl,
                }
            }
        )
        .then(me => {
            Post.updateMany(
                {'creatorId': req.userData.userId},
                {
                    $set: {
                        'creatorProfilePic': cloudinaryUrl 
                    }
                }
            )
            .then(data => {
                res.status(201).json({
                    me
                })
            })
            .catch(error => {
                res.status(500).json({
                    error
                })
            })
        })
        .catch(error => {
            res.status(500).json({
                error
            })
        })
    }
})

router.put('/coverPic', checkAuth, upload.single('coverPic'), (req, res) => {
    let cloudinaryUrl = "";
    if(req.file && typeof(req.file) === "object"){
        exportsFile.uploadOnCloud(req.file).then(data => {
            cloudinaryUrl = data.secure_url;
            mainFunction()
        })
    } else {
        mainFunction()
    };
    
    function mainFunction(){
        User.findOneAndUpdate(
            {_id: req.userData.userId},
            {$set: {'afterLogin.coverPic': cloudinaryUrl}}
        )
        .then(me => {
            res.status(201).json({
                me
            })
        })
        .catch(error => {
            res.status(500).json({
                error
            })
        })
    }
})

// router.put('/disconnect', checkAuth, (req, res) => {
//     User.findOneAndUpdate(
//         {_id: new ObjectId(req.userData.userId)},
//         {
//             $set: {
//                 'afterLogin.connected': false
//             }
//         },
//         {
//             new: true
//         }
//     )
//     .then(data => {
//         console.log('disconnected')
//         res.status(201).json({
//             message: 'disconnected'
//         })
//     })
//     .catch(err => {
//         res.status(400).json({
//             err
//         })
//     })
// })

module.exports = router;