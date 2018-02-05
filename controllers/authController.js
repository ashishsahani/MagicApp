
var Users = require('../models/users');
var bcrypt = require('bcrypt');
var {createCustomer , createSubscription, createCharge, deleteCustomer} = require('../helpers/stripe');

function userRegister(req,res,next){
  var body = req.body;
  body.planId = body.plan.id;
  var userType = body.userType; // 'paid' or 'free'
  if (userType === 'paid'){
    createCustomer(body,userType)
      .then((customer)=>{
        body.customerId = customer.id;
        return createCharge(body.cardToken,body.customerId,body.plan.amount,body.plan.currency)
      })
      .then((charge)=>{
        body.chargeId = charge.id;
        return createSubscription(body.customerId,body.planId)
      })
      .then((subscription)=>{
        //console.log(subscription);
        body.subscriptionId = subscription.id;
        var user = new Users(body)
        return user.save();
      })
      .then((user)=>{
        var sendUserData = {
          email : user.email,
          name : user.name,
          isAdmin: user.isAdmin,
          isActive:user.isActive
        }
        res.status(200).send({status:true,message:"User created", token:user.accessToken , user:sendUserData})
      })
      .catch((err)=>{
        console.log(err);
        deleteCustomer(body.customerId).then(confirmed => console.log('deleted')).catch(err=>console.log(err));
        return res.status(400).send({status:false,message: 'Somthing Went Wrong!'});
      })
  } else {
    // if the user is free, skip charge
    createCustomer(body,userType)
      .then((customer)=>{
        body.customerId = customer.id;
        return createSubscription(body.customerId,body.planId)
      })
      .then((subscription)=>{
        body.subscriptionId = subscription.id;
        var user = new Users(body)
        return user.save();
      })
      .then((user)=>{
        var sendUserData = {
          email : user.email,
          name : user.name,
          isAdmin: user.isAdmin,
          isActive:user.isActive
        }
        res.status(200).send({status:true,message:"User created", token:user.accessToken , user:sendUserData})
      })
      .catch((err)=>{
        console.log(err);
        deleteCustomer(body.customerId).then(confirmed => console.log('deleted')).catch(err=>console.log(err));
        return res.status(400).send({status:false,message: 'Somthing Went Wrong!'});
      })
  }
}

function userLogin(req,res,next){
  var email = req.body.email;
  var password = req.body.password;
  Users.findOne({email}).then((user)=>{
    bcrypt.compare(password, user.password, (err, data) => {
      if (data) {
        var sendUserData ={
          email : user.email,
          name : user.name,
          isAdmin: user.isAdmin,
          isActive:user.isActive
        }
        res.status(200).send({status:true,message:"success", token:user.accessToken , user:sendUserData})
      } else {
        console.log(err);
        res.status(400).send({status:false, err: err, message: 'Password Incorrect !'});
      }
    });
  }).catch((err)=>{
    res.status(400).send({status:false, message:'User not Exists!' });
  })
}

function getAllUsers(req,res,next){
  var token = req.headers.authorization || req.headers.token
  isUserAdmin(token).then(function(user){
    Users.aggregate([
      {
        $match:{
          isAdmin : false
        },
      },
      {
        $project:{
          email : 1,
          name : 1,
          isActive:1
        }
      }
    ],function(err,data){
      if(!err){
        if(data.length === 0){
          res.status(200).send({ message:'No user found',data:[],status:true});
        } else {
          res.status(200).send({ message:'Users Fetched',data:data,status:true})
        }
      } else {
        res.status(500).send({message:'Whoops something went wrong',status:false});
      }
    })
  }).catch(function(){
    res.status(200).send({ message:'Your not authorized',data:[],status:false});
  })
  
}

function updateUser(req,res,next){
  var token = req.headers.authorization || req.headers.token
  var body = req.body;
  var isActive = req.body.isActive;
  var user_id = req.params.id;
  isUserAdmin(token).then(function(){   
    var conditions = { _id:user_id }
      , update = { $set: { isActive : isActive}}
      , options = { multi: false };
    
    Users.update(conditions,update,options).then(function(data){
     if(data.ok ==1 && data.n==1 && data.nModified==1){
       res.status(200).send({message:'Updated',status:true})
     }
    }).catch(function(err){
      console.log(err)
    })
  }).catch(function(err){
    res.status(403).send({message:'Forbidden',status:false})
  }) 
}

function isUserAdmin(token){
  return new Promise(function(resolve,reject){
    Users.aggregate([
      {
        $match:{
          $and:[
            {
              accessToken : token
            },
            {
              isAdmin : true
            }
          ]
        }
      },
      {
        $project : {
          email : 1,
          name : 1
        }
      },
      { $limit : 1 }
    ],function(err,admins){
      if(admins.length != 0){
        resolve(admins);
      } else {
        reject({message:'Not an admin'});
      }

    })
  })
}
module.exports = {
    userRegister,
    userLogin,
    getAllUsers,
    updateUser
}