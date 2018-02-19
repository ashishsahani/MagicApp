/**
 * Name: authController.js
 * Purpose : Authentication controller
 */
var Users = require('../models/users');
var bcrypt = require('bcrypt');
var moment = require('moment');
var {createCustomer , createSubscription, createCharge, deleteCustomer , retrieveCustomer} = require('../helpers/stripe');
var {sendForgetPasswordMail} = require('../helpers/nodemailer.js');
var {createAccessToken} = require('../helpers/jwt');

/**
 * function to register a user
 * @param {object} req 
 * @param {object} res 
 * @param {object} next 
 * @returns response 
 */
function userRegister(req,res,next){
    var body = req.body;
    body.userType = 'paid'  // always have to pay to use the application
    body.stripe= {};
    body.stripe.plan = {
        id : body.plan.id
    };
    body.stripe.cards=[];
    // creating an object to store card details
    var card = {
        id : body.card.id,
        isDefault : true
    }
    body.stripe.cards.push(card);

    // create customer for the stripe 
    createCustomer(body.email,body.cardToken)
        .then((customer)=>{
            body.stripe.customer = {
                id : customer.id
            }
            return createSubscription(body.stripe.customer.id,body.stripe.plan.id)
        }) // create a subscription 
        .then((subscription)=>{
            // adding subscribtion id to the body 
            body.stripe.subscription = {
                id : subscription.id,
            };
            body.accessToken = createAccessToken(body.email);
            var user = new Users(body)
            return user.save();
        }) // create a user 
        .then((user)=>{
            var sendUserData = {
                email : user.email,
                name : user.name,
                isAdmin: user.isAdmin,
                isActive:user.isActive,
                isSubscribed : true
            }
            return res.status(200).send({status:true,message:"User created", token:user.accessToken , user:sendUserData})
        })
        .catch((err)=>{
            console.log(err);

            // deleteCustomer(body.stripe.customer.id)
            //     .then(confirmed => console.log('deleted'))
            //     .catch(err=>console.log(err));

            return res.status(400).send({status:false, message: err.message});
        })
}

/**
 * function to login a user
 * @param {object} req 
 * @param {object} res 
 * @param {object} next 
 * @returns response 
 */
function userLogin(req,res,next){
    var { email, password } = req.body;

    Users
        .findOne({email})
        .select({ email:1,password:1,stripe:1,isActive:1,isAdmin:1,userType:1, accessToken: 1})
        .then(user=>{
            bcrypt
                .compare(password, user.password, (err, data) => {
                    if (data) {
                        if(user.userType == 'free'){
                            var currentDate = new Date ;
                            var isSubscribed = moment(currentDate).isSameOrBefore(user.stripe.subscription.endDate)
                            var sendUserData ={
                                email : user.email,
                                name : user.name,
                                isAdmin: user.isAdmin,
                                isActive:user.isActive,
                                isSubscribed: isSubscribed
                            }
                            //console.log(sendUserData);
                            return res.status(200).send({status:true,message:"success", token:user.accessToken , user:sendUserData})

                        } else {
                            var sendUserData ={
                                email : user.email,
                                name : user.name,
                                isAdmin: user.isAdmin,
                                isActive:user.isActive,
                                isSubscribed: true
                            }
                            return res.status(200).send({status:true,message:"success", token:user.accessToken , user:sendUserData})
                        }
                        
                    } else {
                        console.log(err);
                        return res.status(400).send({status:false, err: err, message: 'Password Incorrect !'});
                    }
                });

        })
        .catch((err)=>{
            return res.status(400).send({status:false, message:'User not Exists!' });
        })
}
/**
 * Function for user's forget password
 * @param {object} req
 * @param {object} res
 */
function userForgetPassword(req,res){
    var email = req.body.email;
    Users
        .findOne({email})
        .select({email:1})
        .then(user =>{
            var resetToken = jwt.sign({ email: user.email },"amagiczap.com" , { expiresIn: 60 * 60 });
            sendForgetPasswordMail(email,resetToken,function(err,info){
                if (!err){
                    res.status(200).send({message: 'An email has been sent to reset password', status: true});
                } else {
                    res.status(500).send({message: 'Something went wrong!', status: false});
                }
            })
        })
        .catch(err=>{
            res.status(500).send({message: 'Something went wrong!', status: false});
        })
}
/**
 * Function for users's reset password
 * @param {object} req 
 * @param {object} res
 */
function userResetPassword(req,res){
    var token = req.headers.authorization || req.params.token;
    var password = req.body.password;
    jwt.verify(token, 'amagiczap.com',function(err, decoded){
        if (!err){
            Users
                .findOne({email : decoded.email})
                .select({password: 1})
                .then(user => {
                    user.password = password ;
                     return user.save()
                })
                .then(docs=>{
                        return res.status(200).send({message:'Password updated',status:true})
                })
                .catch(err=>{
                    console.log(err);
                    res.status(500).send({message:'Something went wrong',status:false})
                })
        } else {
            console.log(err);
            res.status(400).send({message: 'Something went wrong', status: false})
        }        

    });
}
module.exports = {
    userRegister,
    userLogin,
    userForgetPassword,
    userResetPassword
}